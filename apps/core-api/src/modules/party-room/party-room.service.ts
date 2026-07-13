import {
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import {
  RealtimeEvents,
  buildCursorPage,
  decodeCursor,
} from '@litmatch/common-dtos';
import { DomainException } from '@litmatch/common-exceptions';
import { DataSource, EntityManager, IsNull, Repository } from 'typeorm';

import {
  isUniqueViolation,
  violatedConstraint,
} from '../../database/postgres-errors';
import {
  hasLivekitRegionUrls,
  resolveLivekitUrl,
} from '../../common/livekit/livekit-url';
import { publishRealtimeEvent } from '../../common/realtime/publish-realtime';
import { UserService } from '../user';
import {
  PARTY_ROOM_NAME_PREFIX,
  UQ_PARTY_MEMBERS_ACTIVE_USER,
  partyRoomName,
} from './party-room.constants';
import { PartyRoomErrors } from './party-room.errors';
import {
  PartyRoom,
  PartyRoomCloseReason,
  PartyRoomStatus,
} from './entities/party-room.entity';
import {
  PartyRole,
  PartyRoomMember,
} from './entities/party-room-member.entity';
import { PartyLivekitRoomPort } from './ports/livekit-party-room';
import { PARTY_REDIS } from './redis/party-redis.provider';

import type {
  CursorPageMeta,
  PartyMemberJoinedEventData,
  PartyMemberLeftEventData,
  PartyRoleChangedEventData,
  PartyRoomClosedEventData,
  RealtimeEnvelope,
} from '@litmatch/common-dtos';
import type Redis from 'ioredis';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import type { CoreApiEnv } from '../../config/env.validation';
import type { PartyWebhookEvent } from './ports/livekit-party-room';

export interface JoinPartyRoomResult {
  room: PartyRoom;
  membership: PartyRoomMember;
  token: string;
  livekitUrl: string;
}

/** Kết quả close idempotent — memberIds là các member active NGAY TRƯỚC khi đóng (để fanout). */
export interface ClosePartyRoomResult {
  closed: boolean;
  memberIds: string[];
}

/**
 * Nghiệp vụ phòng party multi-user (docs/services/party-room-service.md).
 * Mọi thay đổi state phòng (join/leave/đổi role/close) đều serialize qua lock FOR UPDATE
 * trên row `party_rooms` — cùng pattern tryPair của matching: 1 row làm điểm tuần tự hoá,
 * chốt chặn race "2 request xin speaker đồng thời vượt cap" (docs/10 § Party Room).
 * Quyền publish audio enforce ở SFU (grant theo role + updateParticipant) — không tin client.
 */
@Injectable()
export class PartyRoomService {
  private readonly logger = new Logger(PartyRoomService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(PartyRoom)
    private readonly roomRepo: Repository<PartyRoom>,
    @InjectRepository(PartyRoomMember)
    private readonly memberRepo: Repository<PartyRoomMember>,
    private readonly livekit: PartyLivekitRoomPort,
    private readonly config: ConfigService<CoreApiEnv, true>,
    private readonly userService: UserService,
    @Inject(PARTY_REDIS) private readonly redis: Redis,
  ) {}

  /**
   * Tạo phòng + membership host ATOMIC (không có phòng vô chủ ngay từ lúc sinh), rồi tạo
   * room SFU tường minh (cần maxParticipants/emptyTimeout — không dựa auto-create khi join).
   * SFU fail → compensate đóng phòng vừa tạo, trả 503 cho client thử lại.
   */
  async createRoom(
    user: AuthenticatedUser,
    title: string,
  ): Promise<JoinPartyRoomResult> {
    const cleanTitle = title.trim();
    const maxLen = this.config.getOrThrow('PARTY_TITLE_MAX_LENGTH', {
      infer: true,
    });
    if (cleanTitle.length === 0 || cleanTitle.length > maxLen) {
      throw new DomainException(
        PartyRoomErrors.TITLE_TOO_LONG,
        `Title phải từ 1 tới ${maxLen} ký tự`,
        HttpStatus.BAD_REQUEST,
      );
    }

    // Chốt URL LiveKit theo region của HOST TRƯỚC khi tạo phòng (GĐ7 — ADR 0005): snapshot
    // vào row, phòng ghim 1 endpoint trọn đời — cùng triết lý snapshot với speakerLimit.
    const livekitUrl = await this.resolveHostLivekitUrl(user.userId);

    let room: PartyRoom;
    let membership: PartyRoomMember;
    try {
      ({ room, membership } = await this.dataSource.transaction(
        async (manager) => {
          const createdRoom = await manager.save(
            manager.create(PartyRoom, {
              hostUserId: user.userId,
              title: cleanTitle,
              status: PartyRoomStatus.Active,
              // snapshot config lúc tạo — đổi config không retro phòng đang sống (§ 3.8.A)
              speakerLimit: this.config.getOrThrow('PARTY_MAX_SPEAKERS', {
                infer: true,
              }),
              livekitUrl,
            }),
          );
          const member = await manager.save(
            manager.create(PartyRoomMember, {
              roomId: createdRoom.id,
              userId: user.userId,
              role: PartyRole.Host,
            }),
          );
          return { room: createdRoom, membership: member };
        },
      ));
    } catch (err) {
      // uq_party_members_active_user: host đang ở phòng active khác — 1 user 1 phòng (spec § 3)
      if (
        isUniqueViolation(err) &&
        violatedConstraint(err, UQ_PARTY_MEMBERS_ACTIVE_USER)
      ) {
        throw new DomainException(
          PartyRoomErrors.ALREADY_IN_ANOTHER_ROOM,
          'Bạn đang ở trong 1 phòng khác — rời phòng đó trước',
          HttpStatus.CONFLICT,
        );
      }
      throw err;
    }

    try {
      await this.livekit.createRoom(partyRoomName(room.id), {
        maxParticipants: this.config.getOrThrow('PARTY_MAX_MEMBERS', {
          infer: true,
        }),
        emptyTimeoutSeconds: this.config.getOrThrow(
          'PARTY_EMPTY_ROOM_TIMEOUT_SECONDS',
          { infer: true },
        ),
      });
    } catch (err) {
      this.logger.error(
        `Tạo LiveKit room cho phòng ${room.id} thất bại: ${err instanceof Error ? err.message : String(err)}`,
      );
      await this.closeRoomById(room.id, PartyRoomCloseReason.Error).catch(
        () => undefined,
      );
      // Lỗi hạ tầng (5xx) — không phải lỗi domain của client nên không dùng DomainException (4xx-only)
      throw new ServiceUnavailableException(
        PartyRoomErrors.MEDIA_ROOM_CREATE_FAILED,
        'Không tạo được phòng trên media server — thử lại sau',
      );
    }

    return {
      room,
      membership,
      token: await this.mintToken(room.id, user.userId, PartyRole.Host),
      livekitUrl: this.livekitUrlOf(room),
    };
  }

  /**
   * Join làm audience (spec § 3). Re-join khi đang là member active là hợp lệ (rớt mạng) —
   * trả token mới theo role hiện tại trong DB, không tạo membership mới.
   */
  async joinRoom(
    user: AuthenticatedUser,
    roomId: string,
  ): Promise<JoinPartyRoomResult> {
    const { room, membership, isNewJoin } = await this.dataSource.transaction(
      async (manager) => {
        const lockedRoom = await this.lockActiveRoom(manager, roomId);

        const existing = await manager.findOneBy(PartyRoomMember, {
          roomId,
          userId: user.userId,
          leftAt: IsNull(),
        });
        if (existing) {
          return { room: lockedRoom, membership: existing, isNewJoin: false };
        }

        // Đếm DƯỚI lock phòng — DB và SFU (maxParticipants) cùng 1 giới hạn từ 1 config
        const activeCount = await manager.countBy(PartyRoomMember, {
          roomId,
          leftAt: IsNull(),
        });
        if (
          activeCount >=
          this.config.getOrThrow('PARTY_MAX_MEMBERS', { infer: true })
        ) {
          throw new DomainException(
            PartyRoomErrors.ROOM_FULL,
            'Phòng đã đầy',
            HttpStatus.CONFLICT,
          );
        }

        try {
          const member = await manager.save(
            manager.create(PartyRoomMember, {
              roomId,
              userId: user.userId,
              role: PartyRole.Audience,
            }),
          );
          return { room: lockedRoom, membership: member, isNewJoin: true };
        } catch (err) {
          if (
            isUniqueViolation(err) &&
            violatedConstraint(err, UQ_PARTY_MEMBERS_ACTIVE_USER)
          ) {
            throw new DomainException(
              PartyRoomErrors.ALREADY_IN_ANOTHER_ROOM,
              'Bạn đang ở trong 1 phòng khác — rời phòng đó trước',
              HttpStatus.CONFLICT,
            );
          }
          throw err;
        }
      },
    );

    if (isNewJoin) {
      await this.publishToRoomMembers(
        roomId,
        {
          event: RealtimeEvents.PartyMemberJoined,
          data: {
            roomId,
            userId: user.userId,
            role: membership.role,
          } satisfies PartyMemberJoinedEventData,
        },
        { excludeUserId: user.userId },
      );
    }

    return {
      room,
      membership,
      // URL snapshot của PHÒNG (không phải region người join) — mọi participant về đúng
      // endpoint đã chốt lúc tạo, kể cả khi họ ở region khác host (ADR 0005)
      livekitUrl: this.livekitUrlOf(room),
      token: await this.mintToken(roomId, user.userId, membership.role),
    };
  }

  /**
   * Rời phòng — idempotent (không còn membership active thì no-op). Host rời → ĐÓNG phòng
   * (quyết định GĐ3, spec § 4): đơn giản, không bao giờ có phòng vô chủ chiếm SFU.
   */
  async leaveRoom(user: AuthenticatedUser, roomId: string): Promise<void> {
    const room = await this.roomRepo.findOneBy({ id: roomId });
    if (!room) {
      throw new DomainException(
        PartyRoomErrors.ROOM_NOT_FOUND,
        'Không tìm thấy phòng',
        HttpStatus.NOT_FOUND,
      );
    }

    const left = await this.dataSource.transaction(async (manager) => {
      // Lock phòng cả khi member thường rời — serialize với changeRole đang đếm speaker
      const lockedRoom = await manager.findOne(PartyRoom, {
        where: { id: roomId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!lockedRoom || lockedRoom.status !== PartyRoomStatus.Active) {
        return { wasMember: false, isHost: false };
      }
      const membership = await manager.findOneBy(PartyRoomMember, {
        roomId,
        userId: user.userId,
        leftAt: IsNull(),
      });
      if (!membership) return { wasMember: false, isHost: false };
      if (membership.role === PartyRole.Host) {
        return { wasMember: true, isHost: true };
      }
      membership.leftAt = new Date();
      await manager.save(membership);
      return { wasMember: true, isHost: false };
    });

    if (left.isHost) {
      await this.closeRoomById(roomId, PartyRoomCloseReason.HostLeft);
      return;
    }
    if (!left.wasMember) return;

    // DB đã rời mà SFU còn nối là lệch state (docs/10 § Party Room) — kick best-effort
    await this.livekit
      .removeParticipant(partyRoomName(roomId), user.userId)
      .catch((err) =>
        this.logger.debug(
          `removeParticipant ${user.userId} bỏ qua: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    await this.publishToRoomMembers(roomId, {
      event: RealtimeEvents.PartyMemberLeft,
      data: { roomId, userId: user.userId } satisfies PartyMemberLeftEventData,
    });
  }

  /**
   * Host cấp/thu quyền speaker (docs/06: CHỈ host). Cap speaker check DƯỚI lock phòng —
   * 2 request promote song song thì bên sau thấy count đã tăng (docs/10 § Party Room).
   * Đổi grant SFU TRONG transaction và đợi ACK: SFU fail → rollback DB, không bao giờ
   * DB nói "audience" mà SFU vẫn cho publish.
   */
  async changeRole(
    user: AuthenticatedUser,
    roomId: string,
    targetUserId: string,
    newRole: PartyRole.Speaker | PartyRole.Audience,
  ): Promise<PartyRoomMember> {
    const { member, changed } = await this.dataSource.transaction(
      async (manager) => {
        const room = await this.lockActiveRoom(manager, roomId);

        const caller = await manager.findOneBy(PartyRoomMember, {
          roomId,
          userId: user.userId,
          leftAt: IsNull(),
        });
        if (!caller || caller.role !== PartyRole.Host) {
          throw new DomainException(
            PartyRoomErrors.NOT_HOST,
            'Chỉ host mới được cấp/thu quyền speaker',
            HttpStatus.FORBIDDEN,
          );
        }

        const target = await manager.findOneBy(PartyRoomMember, {
          roomId,
          userId: targetUserId,
          leftAt: IsNull(),
        });
        if (!target) {
          throw new DomainException(
            PartyRoomErrors.TARGET_NOT_A_MEMBER,
            'User không ở trong phòng',
            HttpStatus.NOT_FOUND,
          );
        }
        if (target.role === PartyRole.Host) {
          throw new DomainException(
            PartyRoomErrors.CANNOT_CHANGE_HOST_ROLE,
            'Không đổi role của host',
            HttpStatus.CONFLICT,
          );
        }
        if (target.role === newRole) return { member: target, changed: false };

        if (newRole === PartyRole.Speaker) {
          // speakerLimit đếm role=speaker (host là publisher mặc định, không chiếm slot)
          const speakerCount = await manager.countBy(PartyRoomMember, {
            roomId,
            role: PartyRole.Speaker,
            leftAt: IsNull(),
          });
          if (speakerCount >= room.speakerLimit) {
            throw new DomainException(
              PartyRoomErrors.SPEAKER_LIMIT_REACHED,
              `Phòng đã đủ ${room.speakerLimit} speaker`,
              HttpStatus.CONFLICT,
            );
          }
        }

        target.role = newRole;
        const saved = await manager.save(target);
        // Đợi ACK SFU trong transaction: fail → rollback role DB (không lệch trạng thái);
        // 'not_connected' coi như xong — không nối thì không publish được, token sau theo DB
        await this.livekit.updateParticipantPublish(
          partyRoomName(roomId),
          targetUserId,
          newRole === PartyRole.Speaker,
        );
        return { member: saved, changed: true };
      },
    );

    if (changed) {
      await this.publishToRoomMembers(roomId, {
        event: RealtimeEvents.PartyRoleChanged,
        data: {
          roomId,
          userId: targetUserId,
          role: member.role,
        } satisfies PartyRoleChangedEventData,
      });
    }
    return member;
  }

  /** Chi tiết phòng + member active — đọc công khai (phòng hiện trên list để join). */
  async getRoom(
    roomId: string,
  ): Promise<{ room: PartyRoom; members: PartyRoomMember[] }> {
    const room = await this.roomRepo.findOneBy({ id: roomId });
    if (!room) {
      throw new DomainException(
        PartyRoomErrors.ROOM_NOT_FOUND,
        'Không tìm thấy phòng',
        HttpStatus.NOT_FOUND,
      );
    }
    const members =
      room.status === PartyRoomStatus.Active
        ? await this.memberRepo.findBy({ roomId, leftAt: IsNull() })
        : [];
    return { room, members };
  }

  /**
   * Phòng active + member active — public API cho Gift module (docs/services/gift-service.md):
   * validate người tặng/nhận cùng phòng + lấy danh sách fanout realtime.
   */
  async getActiveRoomMembers(
    roomId: string,
  ): Promise<{ room: PartyRoom; members: PartyRoomMember[] }> {
    const { room, members } = await this.getRoom(roomId);
    if (room.status !== PartyRoomStatus.Active) {
      throw new DomainException(
        PartyRoomErrors.ROOM_CLOSED,
        'Phòng đã đóng',
        HttpStatus.CONFLICT,
      );
    }
    return { room, members };
  }

  /** List phòng active — cursor pagination chuẩn (docs/05 § 5.4). */
  async listRooms(
    limit: number,
    cursor?: string,
  ): Promise<{ data: PartyRoom[]; meta: CursorPageMeta }> {
    const qb = this.roomRepo
      .createQueryBuilder('r')
      .where('r.status = :status', { status: PartyRoomStatus.Active })
      .orderBy('r.created_at', 'DESC')
      .addOrderBy('r.id', 'DESC')
      .limit(limit + 1);

    if (cursor) {
      const pos = decodeCursor<{ createdAt: string; id: string }>(cursor);
      if (!pos?.createdAt || !pos?.id) {
        throw new DomainException(
          PartyRoomErrors.CURSOR_INVALID,
          'Cursor không hợp lệ',
          HttpStatus.BAD_REQUEST,
        );
      }
      qb.andWhere('(r.created_at, r.id) < (:cursorCreatedAt, :cursorId)', {
        cursorCreatedAt: pos.createdAt,
        cursorId: pos.id,
      });
    }

    const rows = await qb.getMany();
    const page = buildCursorPage(rows, limit, (last) => ({
      createdAt: last.createdAt.toISOString(),
      id: last.id,
    }));
    return { data: page.items, meta: page.meta };
  }

  /**
   * Webhook LiveKit ĐÃ verify chữ ký (spec § 5). Idempotent với retry/out-of-order:
   * mọi transition đều no-op khi state đã terminal. Room không phải `party-*` → bỏ qua.
   */
  async handleWebhookEvent(event: PartyWebhookEvent): Promise<void> {
    if (!event.roomName?.startsWith(PARTY_ROOM_NAME_PREFIX)) return;
    const roomId = event.roomName.slice(PARTY_ROOM_NAME_PREFIX.length);
    const room = await this.roomRepo.findOneBy({ id: roomId });
    if (!room) return;

    switch (event.event) {
      case 'participant_left':
        if (event.participantIdentity) {
          await this.handleParticipantLeft(roomId, event.participantIdentity);
        }
        return;
      case 'room_finished':
        await this.closeRoomById(roomId, PartyRoomCloseReason.Finished);
        return;
      default:
        return; // participant_joined: membership đã tạo ở REST join trước khi mint token
    }
  }

  /**
   * Đóng phòng idempotent — endpoint host-leave, webhook và sweeper cùng đi qua đây.
   * Chỉ lời gọi thực hiện transition mới dọn SFU + publish (không bắn đôi khi retry).
   */
  async closeRoomById(
    roomId: string,
    reason: PartyRoomCloseReason,
  ): Promise<ClosePartyRoomResult> {
    const result = await this.dataSource.transaction(async (manager) => {
      const room = await manager.findOne(PartyRoom, {
        where: { id: roomId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!room || room.status === PartyRoomStatus.Closed) {
        return { closed: false, memberIds: [] as string[] };
      }
      const activeMembers = await manager.findBy(PartyRoomMember, {
        roomId,
        leftAt: IsNull(),
      });
      const now = new Date();
      room.status = PartyRoomStatus.Closed;
      room.closeReason = reason;
      room.closedAt = now;
      await manager.save(room);
      if (activeMembers.length > 0) {
        await manager.update(
          PartyRoomMember,
          { roomId, leftAt: IsNull() },
          { leftAt: now },
        );
      }
      return { closed: true, memberIds: activeMembers.map((m) => m.userId) };
    });

    if (result.closed) {
      await this.livekit.deleteRoom(partyRoomName(roomId)).catch((err) => {
        // room có thể đã tự đóng (room_finished/empty timeout) — không phải lỗi nghiệp vụ
        this.logger.debug(
          `deleteRoom ${partyRoomName(roomId)} bỏ qua: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
      const envelope: RealtimeEnvelope<PartyRoomClosedEventData> = {
        event: RealtimeEvents.PartyRoomClosed,
        data: { roomId, reason },
      };
      await Promise.all(
        result.memberIds.map((uid) =>
          publishRealtimeEvent(this.redis, this.logger, uid, envelope),
        ),
      );
    }
    return result;
  }

  // ---------- nội bộ ----------

  /**
   * Chốt URL LiveKit theo region của host (User.region — server derive, cùng nguồn với shard
   * matching, không nhận từ client) lúc TẠO phòng. Chưa bật multi-region (map rỗng — mặc định
   * hôm nay) thì trả thẳng LIVEKIT_URL, không tốn thêm query — hành vi y hệt trước GĐ7.
   */
  private async resolveHostLivekitUrl(hostUserId: string): Promise<string> {
    const defaultUrl = this.config.getOrThrow('LIVEKIT_URL', { infer: true });
    const regionUrls = this.config.getOrThrow('LIVEKIT_REGION_URLS', {
      infer: true,
    });
    if (!hasLivekitRegionUrls(regionUrls)) return defaultUrl;
    const host = await this.userService.getByIdOrThrow(hostUserId);
    return resolveLivekitUrl(regionUrls, defaultUrl, host.region);
  }

  /** URL trả cho client — snapshot của phòng; NULL (row trước migration GĐ7) → LIVEKIT_URL. */
  private livekitUrlOf(room: PartyRoom): string {
    return (
      room.livekitUrl ?? this.config.getOrThrow('LIVEKIT_URL', { infer: true })
    );
  }

  /** Lock row phòng FOR UPDATE + verify còn active — điểm tuần tự hoá mọi thay đổi state. */
  private async lockActiveRoom(
    manager: EntityManager,
    roomId: string,
  ): Promise<PartyRoom> {
    const room = await manager.findOne(PartyRoom, {
      where: { id: roomId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!room) {
      throw new DomainException(
        PartyRoomErrors.ROOM_NOT_FOUND,
        'Không tìm thấy phòng',
        HttpStatus.NOT_FOUND,
      );
    }
    if (room.status !== PartyRoomStatus.Active) {
      throw new DomainException(
        PartyRoomErrors.ROOM_CLOSED,
        'Phòng đã đóng',
        HttpStatus.CONFLICT,
      );
    }
    return room;
  }

  /** participant_left từ SFU: host rớt → đóng phòng (spec § 4); member thường → mark rời. */
  private async handleParticipantLeft(
    roomId: string,
    identity: string,
  ): Promise<void> {
    const membership = await this.memberRepo.findOneBy({
      roomId,
      userId: identity,
      leftAt: IsNull(),
    });
    if (!membership) return; // đã rời qua REST trước đó — webhook retry/đuổi sau là no-op

    if (membership.role === PartyRole.Host) {
      await this.closeRoomById(roomId, PartyRoomCloseReason.HostLeft);
      return;
    }
    const marked = await this.dataSource.transaction(async (manager) => {
      const room = await manager.findOne(PartyRoom, {
        where: { id: roomId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!room || room.status !== PartyRoomStatus.Active) return false;
      // UPDATE có điều kiện left_at IS NULL — webhook trùng không mark 2 lần
      const updated = await manager.update(
        PartyRoomMember,
        { id: membership.id, leftAt: IsNull() },
        { leftAt: new Date() },
      );
      return (updated.affected ?? 0) > 0;
    });
    if (marked) {
      await this.publishToRoomMembers(roomId, {
        event: RealtimeEvents.PartyMemberLeft,
        data: { roomId, userId: identity } satisfies PartyMemberLeftEventData,
      });
    }
  }

  private async mintToken(
    roomId: string,
    userId: string,
    role: PartyRole,
  ): Promise<string> {
    return this.livekit.mintJoinToken(
      partyRoomName(roomId),
      userId,
      this.config.getOrThrow('PARTY_TOKEN_TTL_SECONDS', { infer: true }),
      // audience canPublish=false NGAY TỪ TOKEN — chặn tự unmute ở SFU, không chỉ UI
      { canPublish: role === PartyRole.Host || role === PartyRole.Speaker },
    );
  }

  /** Fanout per-user channel hiện có — gateway zero-logic, không thêm room channel (docs § 3.3). */
  private async publishToRoomMembers(
    roomId: string,
    envelope: RealtimeEnvelope,
    opts: { excludeUserId?: string } = {},
  ): Promise<void> {
    const members = await this.memberRepo.findBy({ roomId, leftAt: IsNull() });
    await Promise.all(
      members
        .filter((m) => m.userId !== opts.excludeUserId)
        .map((m) =>
          publishRealtimeEvent(this.redis, this.logger, m.userId, envelope),
        ),
    );
  }
}
