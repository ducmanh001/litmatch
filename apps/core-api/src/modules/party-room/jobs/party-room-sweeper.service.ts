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

import { ManagedInterval } from '../../../common/scheduling/managed-interval';
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
const HOST_GRACE_JOB = 'party-room-host-grace-check';

/**
 * Backstop chống phòng vô chủ chiếm SFU (docs/10 § Party Room) — webhook LiveKit có thể rớt,
 * nên KHÔNG được là đường duy nhất đóng phòng. Mỗi tick quét phòng active già hơn
 * PARTY_STALE_ROOM_SECONDS và đóng khi 1 trong 2 điều kiện đúng:
 * 1. Không còn member active trong DB (room_finished bị rớt sau khi mọi người đã rời).
 * 2. Room không còn tồn tại trên SFU (mọi webhook đều rớt — DB còn member nhưng SFU đã
 *    empty-timeout; đối chiếu qua roomExists, SFU lỗi thì BỎ QUA phòng đó, không đóng oan).
 * Stateless — chạy nhiều instance an toàn: closeRoomById idempotent dưới lock phòng.
 *
 * Cùng service còn giữ 1 interval THỨ 2, riêng biệt — quét phòng có `hostDisconnectedAt` đã
 * quá PARTY_HOST_DISCONNECT_GRACE_SECONDS (party-room-service.md § 4: host rớt NGOÀI Ý MUỐN qua
 * webhook, chờ tự kết nối lại trước khi đóng). Tách interval riêng (mặc định 5s, ngắn hơn nhiều
 * PARTY_SWEEPER_INTERVAL_MS 30s) vì đây là backstop CHÍNH cho case "phòng còn member khác nhưng
 * host đã rớt" — sweeper cũ chỉ bắt được case "không còn member nào" hoặc "SFU đã tự đóng".
 */
@Injectable()
export class PartyRoomSweeperService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(PartyRoomSweeperService.name);
  private readonly sweeperJob = new ManagedInterval();
  private readonly hostGraceJob = new ManagedInterval();

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService<CoreApiEnv, true>,
    private readonly scheduler: SchedulerRegistry,
    private readonly partyRoomService: PartyRoomService,
    private readonly livekit: PartyLivekitRoomPort,
  ) {}

  onApplicationBootstrap(): void {
    this.sweeperJob.start(this.scheduler, {
      jobName: SWEEPER_JOB,
      intervalMs: this.config.getOrThrow('PARTY_SWEEPER_INTERVAL_MS', {
        infer: true,
      }),
      task: () => this.runOnce(),
      logger: this.logger,
      errorMessage: 'Party sweeper tick lỗi',
    });

    this.hostGraceJob.start(this.scheduler, {
      jobName: HOST_GRACE_JOB,
      intervalMs: this.config.getOrThrow('PARTY_HOST_GRACE_CHECK_INTERVAL_MS', {
        infer: true,
      }),
      task: () => this.runHostGraceCheckOnce(),
      logger: this.logger,
      errorMessage: 'Party host-grace-check lỗi',
    });
  }

  onApplicationShutdown(): void {
    this.sweeperJob.stop();
    this.hostGraceJob.stop();
  }

  /** 1 tick — public để test/chạy tay. */
  async runOnce(): Promise<void> {
    await this.sweeperJob.runExclusive(async () => {
      await this.sweepStaleRooms();
    }, undefined);
  }

  /** 1 tick grace-check — public để test/chạy tay. */
  async runHostGraceCheckOnce(): Promise<void> {
    await this.hostGraceJob.runExclusive(async () => {
      await this.sweepExpiredHostGrace();
    }, undefined);
  }

  /**
   * Đóng phòng có host đã rớt quá hạn grace — `guard` của `closeRoomById` re-check
   * `hostDisconnectedAt` NGAY TRÊN row đã lock, cùng transaction: nếu host vừa rejoin (clear cờ
   * — xem `PartyRoomService.joinRoom`) đúng lúc tick này chạy, Postgres serialize 2 lock cùng
   * row nên guard fail và KHÔNG đóng — không có race đóng nhầm phòng vừa hồi phục.
   */
  private async sweepExpiredHostGrace(): Promise<void> {
    const graceSeconds = this.config.getOrThrow(
      'PARTY_HOST_DISCONNECT_GRACE_SECONDS',
      { infer: true },
    );
    const cutoff = new Date(Date.now() - graceSeconds * 1000);
    const candidates = await this.dataSource.getRepository(PartyRoom).find({
      where: {
        status: PartyRoomStatus.Active,
        hostDisconnectedAt: LessThan(cutoff),
      },
    });

    for (const room of candidates) {
      try {
        await this.partyRoomService.closeRoomById(
          room.id,
          PartyRoomCloseReason.HostLeft,
          (locked) =>
            locked.hostDisconnectedAt !== null &&
            locked.hostDisconnectedAt.getTime() + graceSeconds * 1000 <=
              Date.now(),
        );
      } catch (err) {
        this.logger.error(
          { err: `${err}` },
          `Đóng phòng ${room.id} do hết grace host lỗi — thử lại ở tick sau`,
        );
      }
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
