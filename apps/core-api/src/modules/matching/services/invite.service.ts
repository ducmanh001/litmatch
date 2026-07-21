import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import {
  RealtimeEvents,
  buildCursorPage,
  decodeCursor,
} from '@litmatch/common-dtos';
import { DomainException } from '@litmatch/common-exceptions';
import { DataSource, In, Repository } from 'typeorm';

import {
  isUniqueViolation,
  violatedConstraint,
} from '../../../database/postgres-errors';
import { publishRealtimeEvent } from '../../../common/realtime/publish-realtime';
import { checkRateLimit } from '../../../common/redis/rate-limit';
import {
  ageBandOf,
  inviteAcceptIdempotencyKey,
  trustPenaltyMsOf,
} from '../matching.constants';
import { MatchingErrors } from '../matching.errors';
import {
  MATCH_INVITE_TRANSITIONS,
  MatchInvite,
  MatchInviteStatus,
} from '../entities/match-invite.entity';
import {
  MatchTicket,
  MatchTicketStatus,
} from '../entities/match-ticket.entity';
import {
  MatchSession,
  MatchSessionStatus,
} from '../entities/match-session.entity';
import { MATCHING_REDIS } from '../redis/matching-redis.provider';
import { MATCH_INTERACTION_POLICY } from '../ports/interaction-policy';
import { NotificationService, NotificationType } from '../../notification';
import { SafetyService } from '../../safety';
import { User, UserService, UserStatus } from '../../user';

import type Redis from 'ioredis';
import type {
  CursorPage,
  CursorPageQueryDto,
  MatchConfirmedEventData,
  RealtimeEnvelope,
} from '@litmatch/common-dtos';
import type { EntityManager } from 'typeorm';
import type { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import type { CoreApiEnv } from '../../../config/env.validation';
import type { MatchInteractionPolicy } from '../ports/interaction-policy';
import type { CreateInviteDto } from '../dto/invite.dtos';

const RATE_LIMIT_WINDOW_SECONDS = 3600;

function inviteRateLimitKey(userId: string): string {
  return `matching:invite:count:${userId}`;
}

/**
 * CTA "mời Voice/Soul Match" (W4, docs/services/matching-service.md § Invite). Accept tạo trực
 * tiếp `MatchTicket`/`MatchSession` đã confirmed — bỏ qua hàng đợi shard,
 * tái dùng NGUYÊN các bước validate của `MatcherWorkerService.tryPair` (canPair, invariant
 * 1-user-1-queue qua `uq_match_tickets_active_user`) — từ đó luồng y hệt auto-match
 * (Soul Match/Calling vào phòng ngay). KHÔNG check gender preference lúc accept
 * — đây là consent trực tiếp (invitee chủ động chấp nhận ĐÚNG người này), khác auto-match nặc
 * danh cần lọc trước khi biết đối phương là ai.
 */
@Injectable()
export class InviteService {
  private readonly logger = new Logger(InviteService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(MatchInvite)
    private readonly inviteRepo: Repository<MatchInvite>,
    private readonly userService: UserService,
    private readonly safetyService: SafetyService,
    private readonly notificationService: NotificationService,
    @Inject(MATCH_INTERACTION_POLICY)
    private readonly interactionPolicy: MatchInteractionPolicy,
    @Inject(MATCHING_REDIS) private readonly redis: Redis,
    private readonly config: ConfigService<CoreApiEnv, true>,
  ) {}

  async createInvite(
    user: AuthenticatedUser,
    dto: CreateInviteDto,
  ): Promise<MatchInvite> {
    if (dto.inviteeUserId === user.userId) {
      throw new DomainException(
        MatchingErrors.INVITE_TARGET_UNAVAILABLE,
        'Không thể tự mời chính mình',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    const maxPerHour = this.config.getOrThrow(
      'MATCHING_INVITE_RATE_LIMIT_PER_HOUR',
      { infer: true },
    );
    const allowed = await checkRateLimit(
      this.redis,
      inviteRateLimitKey(user.userId),
      maxPerHour,
      RATE_LIMIT_WINDOW_SECONDS,
    );
    if (!allowed) {
      throw new DomainException(
        MatchingErrors.INVITE_RATE_LIMITED,
        `Vượt giới hạn ${maxPerHour} lời mời/giờ`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    await this.assertInviteeAvailable(user.userId, dto.inviteeUserId);

    const ttlSeconds = this.config.getOrThrow('MATCHING_INVITE_TTL_SECONDS', {
      infer: true,
    });
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    let invite: MatchInvite;
    try {
      invite = await this.inviteRepo.save(
        this.inviteRepo.create({
          inviterUserId: user.userId,
          inviteeUserId: dto.inviteeUserId,
          matchType: dto.matchType,
          status: MatchInviteStatus.Pending,
          expiresAt,
          respondedAt: null,
          sessionId: null,
        }),
      );
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new DomainException(
          MatchingErrors.INVITE_ALREADY_PENDING,
          'Đã có 1 lời mời đang chờ phản hồi tới người này',
          HttpStatus.CONFLICT,
        );
      }
      throw err;
    }

    const notification = await this.notificationService.create({
      userId: dto.inviteeUserId,
      type: NotificationType.MatchInviteReceived,
      payload: {
        inviteId: invite.id,
        inviterUserId: user.userId,
        matchType: dto.matchType,
      },
    });
    await this.notificationService.sendPush(notification);

    return invite;
  }

  async getInvite(
    user: AuthenticatedUser,
    inviteId: string,
  ): Promise<MatchInvite> {
    const invite = await this.inviteRepo.findOneBy({ id: inviteId });
    if (!invite) {
      throw new DomainException(
        MatchingErrors.INVITE_NOT_FOUND,
        'Không tìm thấy lời mời',
        HttpStatus.NOT_FOUND,
      );
    }
    if (
      invite.inviterUserId !== user.userId &&
      invite.inviteeUserId !== user.userId
    ) {
      throw new DomainException(
        MatchingErrors.INVITE_FORBIDDEN,
        'Lời mời không thuộc về bạn',
        HttpStatus.FORBIDDEN,
      );
    }
    return invite;
  }

  /** Inbox lời mời ĐANG chờ phản hồi — accept/decline/expire/cancel không còn hành động được nên không hiện lại. */
  async listReceivedInvites(
    user: AuthenticatedUser,
    query: CursorPageQueryDto,
  ): Promise<CursorPage<MatchInvite>> {
    // Re-check hidden set ở MỖI lần đọc inbox: block/report có thể phát sinh sau khi invite được
    // tạo; không buộc user phải nhìn hoặc phản hồi lời mời từ người họ vừa ẩn.
    const hiddenInviterIds = await this.safetyService.getHiddenUserIds(
      user.userId,
    );
    const qb = this.inviteRepo
      .createQueryBuilder('i')
      .where('i.inviteeUserId = :userId', { userId: user.userId })
      .andWhere('i.status = :status', { status: MatchInviteStatus.Pending });

    if (hiddenInviterIds.length > 0) {
      qb.andWhere('i.inviterUserId NOT IN (:...hiddenInviterIds)', {
        hiddenInviterIds,
      });
    }

    if (query.cursor) {
      const pos = this.decodeInviteCursor(query.cursor);
      qb.andWhere('(i.createdAt, i.id) < (:cursorCreatedAt, :cursorId)', {
        cursorCreatedAt: pos.createdAt,
        cursorId: pos.id,
      });
    }

    const rows = await qb
      .orderBy('i.createdAt', 'DESC')
      .addOrderBy('i.id', 'DESC')
      .take(query.limit + 1)
      .getMany();
    return buildCursorPage(rows, query.limit, (last) => ({
      createdAt: last.createdAt.toISOString(),
      id: last.id,
    }));
  }

  async declineInvite(
    user: AuthenticatedUser,
    inviteId: string,
  ): Promise<MatchInvite> {
    return this.dataSource.transaction(async (manager) => {
      const invite = await this.lockInvite(manager, inviteId);
      if (invite.inviteeUserId !== user.userId) {
        throw new DomainException(
          MatchingErrors.INVITE_FORBIDDEN,
          'Lời mời không thuộc về bạn',
          HttpStatus.FORBIDDEN,
        );
      }
      this.assertNotExpired(invite);
      this.assertTransition(invite, MatchInviteStatus.Declined);
      invite.status = MatchInviteStatus.Declined;
      invite.respondedAt = new Date();
      return manager.save(invite);
    });
  }

  async cancelInvite(
    user: AuthenticatedUser,
    inviteId: string,
  ): Promise<MatchInvite> {
    return this.dataSource.transaction(async (manager) => {
      const invite = await this.lockInvite(manager, inviteId);
      if (invite.inviterUserId !== user.userId) {
        throw new DomainException(
          MatchingErrors.INVITE_FORBIDDEN,
          'Lời mời không thuộc về bạn',
          HttpStatus.FORBIDDEN,
        );
      }
      this.assertNotExpired(invite);
      this.assertTransition(invite, MatchInviteStatus.Cancelled);
      invite.status = MatchInviteStatus.Cancelled;
      invite.respondedAt = new Date();
      return manager.save(invite);
    });
  }

  /**
   * Accept — tạo trực tiếp ticket/session đã confirmed, bỏ qua hàng
   * đợi shard. Idempotent qua `inviteAcceptIdempotencyKey` — accept lặp lại (retry mạng) đọc lại
   * đúng kết quả cũ thay vì lỗi (docs/05 § 5.10).
   */
  async acceptInvite(
    user: AuthenticatedUser,
    inviteId: string,
  ): Promise<{
    invite: MatchInvite;
    session: MatchSession;
    inviteeTicketId: string;
  }> {
    // Transaction RIÊNG cho precheck: nếu canPair fail, invite phải chuyển Declined và COMMIT
    // TRƯỚC KHI throw — throw trong CÙNG transaction sẽ rollback luôn phần Declined vừa ghi
    // (đã bắt được lỗi này qua test thật, không phải suy đoán).
    const precheck = await this.precheckAccept(user, inviteId);
    if (precheck.kind === 'already_accepted') {
      return {
        invite: precheck.invite,
        session: precheck.session,
        inviteeTicketId: precheck.inviteeTicketId,
      };
    }
    if (precheck.kind === 'blocked') {
      throw new DomainException(
        MatchingErrors.INVITE_TARGET_UNAVAILABLE,
        'Không thể ghép với người này',
        HttpStatus.FORBIDDEN,
      );
    }

    let matchedPair: Array<{
      userId: string;
      ticketId: string;
      sessionId: string;
    }> | null = null;

    const result = await this.dataSource.transaction(async (manager) => {
      const invite = await this.lockInvite(manager, inviteId);
      if (invite.inviteeUserId !== user.userId) {
        throw new DomainException(
          MatchingErrors.INVITE_FORBIDDEN,
          'Lời mời không thuộc về bạn',
          HttpStatus.FORBIDDEN,
        );
      }

      // Đã accept trước đó (replay giữa lúc precheck và đây) → trả lại session cũ
      if (invite.status === MatchInviteStatus.Accepted && invite.sessionId) {
        const session = await manager.findOneByOrFail(MatchSession, {
          id: invite.sessionId,
        });
        const inviteeTicket = await manager.findOneByOrFail(MatchTicket, {
          idempotencyKey: inviteAcceptIdempotencyKey(invite.id, 'invitee'),
        });
        return { invite, session, inviteeTicketId: inviteeTicket.id };
      }

      this.assertNotExpired(invite);
      this.assertTransition(invite, MatchInviteStatus.Accepted);

      const users = await manager.find(User, {
        where: { id: In([invite.inviterUserId, invite.inviteeUserId]) },
      });
      const userById = new Map(users.map((u) => [u.id, u]));
      const inviter = userById.get(invite.inviterUserId);
      const invitee = userById.get(invite.inviteeUserId);
      if (
        !inviter ||
        !invitee ||
        inviter.status !== UserStatus.Active ||
        invitee.status !== UserStatus.Active
      ) {
        throw new DomainException(
          MatchingErrors.USER_BANNED,
          'Một trong hai bên không còn khả dụng để ghép',
          HttpStatus.CONFLICT,
        );
      }

      const [ticketInviter, ticketInvitee] = await this.createMatchedTickets(
        manager,
        invite,
        inviter,
        invitee,
      );

      const confirmedAt = new Date();
      const session = await manager.save(
        manager.create(MatchSession, {
          matchType: invite.matchType,
          userAId: invite.inviterUserId,
          userBId: invite.inviteeUserId,
          ticketAId: ticketInviter.id,
          ticketBId: ticketInvitee.id,
          status: MatchSessionStatus.Confirmed,
          confirmedAAt: confirmedAt,
          confirmedBAt: confirmedAt,
        }),
      );
      ticketInviter.sessionId = session.id;
      ticketInvitee.sessionId = session.id;
      ticketInviter.status = MatchTicketStatus.Confirmed;
      ticketInvitee.status = MatchTicketStatus.Confirmed;
      await manager.save([ticketInviter, ticketInvitee]);

      invite.status = MatchInviteStatus.Accepted;
      invite.respondedAt = new Date();
      invite.sessionId = session.id;
      await manager.save(invite);

      matchedPair = [
        {
          userId: inviter.id,
          ticketId: ticketInviter.id,
          sessionId: session.id,
        },
        {
          userId: invitee.id,
          ticketId: ticketInvitee.id,
          sessionId: session.id,
        },
      ];
      return { invite, session, inviteeTicketId: ticketInvitee.id };
    });

    if (matchedPair) {
      // Publish cùng event auto-match dùng; client refetch rồi vào phòng ngay.
      const pair = matchedPair as Array<{
        userId: string;
        ticketId: string;
        sessionId: string;
      }>;
      await Promise.all(
        pair.map(({ userId, ticketId, sessionId }) => {
          const envelope: RealtimeEnvelope<MatchConfirmedEventData> = {
            event: RealtimeEvents.MatchConfirmed,
            data: { ticketId, sessionId },
          };
          return publishRealtimeEvent(
            this.redis,
            this.logger,
            userId,
            envelope,
          );
        }),
      );
    }
    return result;
  }

  // ---------- nội bộ ----------

  /**
   * Transaction RIÊNG, chạy TRƯỚC transaction tạo ticket/session — khoá invite, kiểm tra
   * ownership/hết hạn/transition, re-check `canPair` (block có thể phát sinh SAU khi mời).
   * Nếu không pair được, ghi Declined và COMMIT ngay ở đây rồi trả `kind: 'blocked'` để caller
   * throw NGOÀI transaction — throw trong transaction sẽ rollback luôn phần Declined vừa ghi.
   */
  private async precheckAccept(
    user: AuthenticatedUser,
    inviteId: string,
  ): Promise<
    | { kind: 'proceed' }
    | {
        kind: 'already_accepted';
        invite: MatchInvite;
        session: MatchSession;
        inviteeTicketId: string;
      }
    | { kind: 'blocked' }
  > {
    return this.dataSource.transaction(async (manager) => {
      const invite = await this.lockInvite(manager, inviteId);
      if (invite.inviteeUserId !== user.userId) {
        throw new DomainException(
          MatchingErrors.INVITE_FORBIDDEN,
          'Lời mời không thuộc về bạn',
          HttpStatus.FORBIDDEN,
        );
      }

      if (invite.status === MatchInviteStatus.Accepted && invite.sessionId) {
        const session = await manager.findOneByOrFail(MatchSession, {
          id: invite.sessionId,
        });
        const inviteeTicket = await manager.findOneByOrFail(MatchTicket, {
          idempotencyKey: inviteAcceptIdempotencyKey(invite.id, 'invitee'),
        });
        return {
          kind: 'already_accepted' as const,
          invite,
          session,
          inviteeTicketId: inviteeTicket.id,
        };
      }

      this.assertNotExpired(invite);
      this.assertTransition(invite, MatchInviteStatus.Accepted);

      const canPair = await this.interactionPolicy.canPair(
        invite.inviterUserId,
        invite.inviteeUserId,
      );
      if (!canPair) {
        invite.status = MatchInviteStatus.Declined;
        invite.respondedAt = new Date();
        await manager.save(invite);
        return { kind: 'blocked' as const };
      }
      return { kind: 'proceed' as const };
    });
  }

  /**
   * Insert cả 2 ticket Matched trong CÙNG transaction — unique violation ở
   * `uq_match_tickets_active_user` (1 trong 2 bên đang bận queue/session khác) rollback toàn bộ,
   * invite giữ nguyên Pending để thử lại sau; unique violation ở idempotency_key là replay accept
   * cũ → đọc lại đúng 2 ticket đã tạo.
   *
   * LƯU Ý (giới hạn đã biết): nhánh đọc lại theo `idempotencyKey` bên dưới, nếu THẬT SỰ chạy
   * (insert lỗi unique + đọc lại trong CÙNG 1 transaction Postgres), sẽ vỡ vì Postgres abort
   * toàn bộ transaction ngay khi 1 statement lỗi — câu SELECT sau đó nhận
   * "current transaction is aborted" (bắt được lỗi y hệt ở `SafetyService.reportVideo`, đã sửa
   * bằng cách bỏ transaction bọc ngoài). Nhánh này hiện KHÔNG unreachable trong thực tế vì
   * `precheckAccept` đã khoá `FOR UPDATE` row invite trước — request accept thứ 2 luôn thấy
   * invite đã `accepted` và trả về sớm ở đó, không bao giờ chạy tới insert ticket lần 2. Nếu sau
   * này bỏ lock đó, phải tách bước tạo ticket ra 1 transaction/savepoint riêng.
   */
  private async createMatchedTickets(
    manager: EntityManager,
    invite: MatchInvite,
    inviter: User,
    invitee: User,
  ): Promise<[MatchTicket, MatchTicket]> {
    try {
      const [ticketInviter, ticketInvitee] = await manager.save([
        this.draftMatchedTicket(manager, invite, inviter, 'inviter'),
        this.draftMatchedTicket(manager, invite, invitee, 'invitee'),
      ]);
      return [ticketInviter, ticketInvitee];
    } catch (err) {
      if (violatedConstraint(err, 'uq_match_tickets_active_user')) {
        throw new DomainException(
          MatchingErrors.INVITE_ACCEPT_USER_BUSY,
          'Một trong hai bên đang ở trong hàng đợi/phiên ghép khác',
          HttpStatus.CONFLICT,
        );
      }
      if (!isUniqueViolation(err)) throw err;

      const existing = await manager.find(MatchTicket, {
        where: {
          idempotencyKey: In([
            inviteAcceptIdempotencyKey(invite.id, 'inviter'),
            inviteAcceptIdempotencyKey(invite.id, 'invitee'),
          ]),
        },
      });
      const byKey = new Map(existing.map((t) => [t.idempotencyKey, t]));
      const ticketInviter = byKey.get(
        inviteAcceptIdempotencyKey(invite.id, 'inviter'),
      );
      const ticketInvitee = byKey.get(
        inviteAcceptIdempotencyKey(invite.id, 'invitee'),
      );
      if (!ticketInviter || !ticketInvitee) throw err;
      return [ticketInviter, ticketInvitee];
    }
  }

  private draftMatchedTicket(
    manager: EntityManager,
    invite: MatchInvite,
    profile: User,
    role: 'inviter' | 'invitee',
  ): MatchTicket {
    const bandSize = this.config.getOrThrow('MATCHING_AGE_BAND_SIZE', {
      infer: true,
    });
    const perPoint = this.config.getOrThrow(
      'MATCHING_TRUST_PENALTY_MS_PER_POINT',
      { infer: true },
    );
    const maxMs = this.config.getOrThrow('MATCHING_TRUST_PENALTY_MAX_MS', {
      infer: true,
    });
    return manager.create(MatchTicket, {
      userId: profile.id,
      matchType: invite.matchType,
      region: profile.region ?? 'GLOBAL',
      ageBand: ageBandOf(profile.birthDate, bandSize),
      status: MatchTicketStatus.Matched,
      enqueuedAt: new Date(),
      priorityBoostMs: 0,
      trustPenaltyMs: trustPenaltyMsOf(profile.trustScore, perPoint, maxMs),
      sessionId: null,
      idempotencyKey: inviteAcceptIdempotencyKey(invite.id, role),
    });
  }

  /** Cùng mã lỗi bất kể lý do (không tồn tại/banned/trong hidden-set) — oracle-safe. */
  private async assertInviteeAvailable(
    inviterId: string,
    inviteeId: string,
  ): Promise<void> {
    const hiddenIds = await this.safetyService.getHiddenUserIds(inviterId);
    if (hiddenIds.includes(inviteeId)) {
      throw new DomainException(
        MatchingErrors.INVITE_TARGET_UNAVAILABLE,
        'Không thể mời người này',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    const invitee = await this.userService
      .getByIdOrThrow(inviteeId)
      .catch(() => null);
    if (!invitee || invitee.status !== UserStatus.Active) {
      throw new DomainException(
        MatchingErrors.INVITE_TARGET_UNAVAILABLE,
        'Không thể mời người này',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
  }

  private async lockInvite(
    manager: EntityManager,
    inviteId: string,
  ): Promise<MatchInvite> {
    const invite = await manager.findOne(MatchInvite, {
      where: { id: inviteId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!invite) {
      throw new DomainException(
        MatchingErrors.INVITE_NOT_FOUND,
        'Không tìm thấy lời mời',
        HttpStatus.NOT_FOUND,
      );
    }
    return invite;
  }

  /** Lazy-expire: sweeper có thể chưa kịp chạy — verify lại TẠI THỜI ĐIỂM hành động (docs/10 § 10.0.C). */
  private assertNotExpired(invite: MatchInvite): void {
    if (
      invite.status === MatchInviteStatus.Pending &&
      invite.expiresAt.getTime() <= Date.now()
    ) {
      invite.status = MatchInviteStatus.Expired;
      throw new DomainException(
        MatchingErrors.INVITE_INVALID_TRANSITION,
        'Lời mời đã hết hạn',
        HttpStatus.CONFLICT,
      );
    }
  }

  private assertTransition(invite: MatchInvite, to: MatchInviteStatus): void {
    if (!MATCH_INVITE_TRANSITIONS[invite.status].includes(to)) {
      throw new DomainException(
        MatchingErrors.INVITE_INVALID_TRANSITION,
        `Không thể chuyển invite từ '${invite.status}' sang '${to}'`,
        HttpStatus.CONFLICT,
      );
    }
  }

  private decodeInviteCursor(cursor: string): {
    createdAt: string;
    id: string;
  } {
    const pos = decodeCursor<{ createdAt?: unknown; id?: unknown }>(cursor);
    if (
      !pos ||
      typeof pos.createdAt !== 'string' ||
      typeof pos.id !== 'string'
    ) {
      throw new DomainException(
        MatchingErrors.INVITE_CURSOR_INVALID,
        'Cursor không hợp lệ',
        HttpStatus.BAD_REQUEST,
      );
    }
    return { createdAt: pos.createdAt, id: pos.id };
  }
}
