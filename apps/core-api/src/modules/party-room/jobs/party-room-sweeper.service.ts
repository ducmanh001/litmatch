import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, IsNull, LessThan } from 'typeorm';

import { partyRoomName } from '../party-room.constants';
import { PartyRoomService } from '../party-room.service';
import {
  PartyRoom,
  PartyRoomCloseReason,
  PartyRoomStatus,
} from '../entities/party-room.entity';
import { PartyRoomMember } from '../entities/party-room-member.entity';
import { PartyLivekitRoomPort } from '../ports/livekit-party-room';

import type { CoreApiEnv } from '../../../config/env.validation';

const SWEEPER_JOB = 'party-room-sweeper';

/**
 * Backstop chống phòng vô chủ chiếm SFU (docs/10 § Party Room) — webhook LiveKit có thể rớt,
 * nên KHÔNG được là đường duy nhất đóng phòng. Mỗi tick quét phòng active già hơn
 * PARTY_STALE_ROOM_SECONDS và đóng khi 1 trong 2 điều kiện đúng:
 * 1. Không còn member active trong DB (room_finished bị rớt sau khi mọi người đã rời).
 * 2. Room không còn tồn tại trên SFU (mọi webhook đều rớt — DB còn member nhưng SFU đã
 *    empty-timeout; đối chiếu qua roomExists, SFU lỗi thì BỎ QUA phòng đó, không đóng oan).
 * Stateless — chạy nhiều instance an toàn: closeRoomById idempotent dưới lock phòng.
 */
@Injectable()
export class PartyRoomSweeperService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(PartyRoomSweeperService.name);
  private running = false;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService<CoreApiEnv, true>,
    private readonly scheduler: SchedulerRegistry,
    private readonly partyRoomService: PartyRoomService,
    private readonly livekit: PartyLivekitRoomPort,
  ) {}

  onApplicationBootstrap(): void {
    const interval = setInterval(
      () =>
        void this.runOnce().catch((err) =>
          this.logger.error({ err: `${err}` }, 'Party sweeper tick lỗi'),
        ),
      this.config.getOrThrow('PARTY_SWEEPER_INTERVAL_MS', { infer: true }),
    );
    this.scheduler.addInterval(SWEEPER_JOB, interval);
  }

  onApplicationShutdown(): void {
    if (this.scheduler.doesExist('interval', SWEEPER_JOB))
      this.scheduler.deleteInterval(SWEEPER_JOB);
  }

  /** 1 tick — public để test/chạy tay. */
  async runOnce(): Promise<void> {
    if (this.running) return; // tick trước chưa xong thì bỏ qua, không chồng
    this.running = true;
    try {
      await this.sweepStaleRooms();
    } finally {
      this.running = false;
    }
  }

  private async sweepStaleRooms(): Promise<void> {
    const staleSeconds = this.config.getOrThrow('PARTY_STALE_ROOM_SECONDS', {
      infer: true,
    });
    const cutoff = new Date(Date.now() - staleSeconds * 1000);
    const candidates = await this.dataSource.getRepository(PartyRoom).find({
      where: {
        status: PartyRoomStatus.Active,
        createdAt: LessThan(cutoff),
      },
    });

    for (const room of candidates) {
      try {
        const activeMembers = await this.dataSource
          .getRepository(PartyRoomMember)
          .countBy({ roomId: room.id, leftAt: IsNull() });
        if (activeMembers === 0) {
          await this.partyRoomService.closeRoomById(
            room.id,
            PartyRoomCloseReason.Swept,
          );
          continue;
        }
        // DB còn member nhưng SFU đã empty-timeout → mọi webhook rớt, đóng để giải phóng
        if (!(await this.livekit.roomExists(partyRoomName(room.id)))) {
          this.logger.warn(
            `Phòng ${room.id} còn ${activeMembers} member trong DB nhưng SFU đã đóng — sweep`,
          );
          await this.partyRoomService.closeRoomById(
            room.id,
            PartyRoomCloseReason.Swept,
          );
        }
      } catch (err) {
        // SFU/DB lỗi tạm thời — bỏ qua phòng này, tick sau thử lại (không đóng oan)
        this.logger.error(
          { err: `${err}` },
          `Sweep phòng ${room.id} lỗi — thử lại ở tick sau`,
        );
      }
    }
  }
}
