import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import {
  RealtimeEvents,
  buildCursorPage,
  decodeCursor,
} from '@litmatch/common-dtos';
import { DomainException } from '@litmatch/common-exceptions';
import { DataSource, Repository } from 'typeorm';

import { isUniqueViolation } from '../../database/postgres-errors';
import { publishRealtimeEvent } from '../../common/realtime/publish-realtime';
import { messageIdempotencyKey } from './soul-match.constants';
import { SOUL_MATCH_REDIS } from './redis/soul-match-redis.provider';
import { SoulMatchErrors } from './soul-match.errors';
import { SoulChatMessage } from './entities/soul-chat-message.entity';
import {
  SoulMatchRating,
  SoulMatchVerdict,
} from './entities/soul-match-rating.entity';
import { FriendService, FriendshipSource } from '../friend';
import {
  MatchSession,
  MatchSessionStatus,
  MatchType,
  MatchingService,
} from '../matching';
import { PublicProfileDto, UserService, UserStatus } from '../user';

import type {
  CursorPage,
  RealtimeEnvelope,
  SoulMatchedEventData,
  SoulMessageEventData,
} from '@litmatch/common-dtos';
import type Redis from 'ioredis';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import type { CoreApiEnv } from '../../config/env.validation';
import type { RateSessionDto, SendMessageDto } from './dto/soul-match.dtos';

/** Phase phòng chat — derive từ timestamp DB + giờ server (docs/services/soul-match-service.md § 1). */
export enum SoulRoomPhase {
  Chatting = 'chatting',
  Rating = 'rating',
  Closed = 'closed',
}

/**
 * View dẫn xuất của phòng chat ẩn danh — KHÔNG có entity/cột state riêng: phase derive
 * từ `MatchSession.confirmed*At` + config tại thời điểm đọc, timer enforce ở server
 * (docs/services/soul-match-service.md § 1; docs/10 § Soul Match: không tin timer client).
 */
export interface SoulRoomView {
  session: MatchSession;
  chatEndsAt: Date;
  ratingEndsAt: Date;
  phase: SoulRoomPhase;
}

export interface RateResult {
  verdict: SoulMatchVerdict;
  matched: boolean;
}

/**
 * Nghiệp vụ Soul Match (docs/services/soul-match-service.md): chat ẩn danh tạm thời
 * gắn MatchSession đã confirmed, rating 2 chiều, cả 2 "like" → Friendship (module friend)
 * trong CÙNG transaction. Quyền ghi MatchSession vẫn thuộc Matching — ở đây chỉ đọc + lock.
 */
@Injectable()
export class SoulMatchService {
  private readonly logger = new Logger(SoulMatchService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(SoulChatMessage)
    private readonly messageRepo: Repository<SoulChatMessage>,
    @InjectRepository(SoulMatchRating)
    private readonly ratingRepo: Repository<SoulMatchRating>,
    private readonly matchingService: MatchingService,
    private readonly friendService: FriendService,
    private readonly userService: UserService,
    private readonly config: ConfigService<CoreApiEnv, true>,
    @Inject(SOUL_MATCH_REDIS) private readonly redis: Redis,
  ) {}

  /** Trạng thái phòng cho member poll — chỉ verdict của mình + cờ matched (spec § 2). */
  async getSessionView(
    user: AuthenticatedUser,
    sessionId: string,
  ): Promise<{
    room: SoulRoomView;
    myVerdict: SoulMatchVerdict | null;
    matched: boolean;
  }> {
    const room = await this.getRoomForMember(user, sessionId);
    const [myRating, matched] = await Promise.all([
      this.ratingRepo.findOneBy({ sessionId, raterUserId: user.userId }),
      this.friendService.areFriends(room.session.userAId, room.session.userBId),
    ]);
    return { room, myVerdict: myRating?.verdict ?? null, matched };
  }

  /**
   * Gửi message — chỉ phase `chatting`. Idempotency-Key bắt buộc, unique DB:
   * retry không nhân đôi (docs/05 § 5.10). Re-check ban tại thời điểm gửi (§ 10.0.C).
   */
  async sendMessage(
    user: AuthenticatedUser,
    sessionId: string,
    dto: SendMessageDto,
    idempotencyKey: string,
  ): Promise<SoulChatMessage> {
    const room = await this.getRoomForMember(user, sessionId);
    if (room.phase !== SoulRoomPhase.Chatting) {
      throw new DomainException(
        SoulMatchErrors.CHAT_NOT_OPEN,
        'Hết giờ chat — phòng đã chuyển sang đánh giá hoặc đã đóng',
        HttpStatus.CONFLICT,
        { phase: room.phase },
      );
    }

    const profile = await this.userService.getByIdOrThrow(user.userId);
    if (profile.status === UserStatus.Banned) {
      throw new DomainException(
        SoulMatchErrors.USER_BANNED,
        'Tài khoản bị khoá',
        HttpStatus.FORBIDDEN,
      );
    }

    const maxLength = this.config.getOrThrow('SOUL_CHAT_MESSAGE_MAX_LENGTH', {
      infer: true,
    });
    if (dto.content.length > maxLength) {
      throw new DomainException(
        SoulMatchErrors.MESSAGE_TOO_LONG,
        `Message dài quá ${maxLength} ký tự`,
        HttpStatus.UNPROCESSABLE_ENTITY,
        { maxLength },
      );
    }

    const prefixedKey = messageIdempotencyKey(user.userId, idempotencyKey);
    try {
      const message = await this.messageRepo.save(
        this.messageRepo.create({
          sessionId,
          senderUserId: user.userId,
          content: dto.content,
          idempotencyKey: prefixedKey,
        }),
      );
      // Realtime SAU khi persist, chỉ cho message MỚI (replay không bắn lại) — best-effort,
      // senderRole tính per-recipient TẠI ĐÂY để gateway không phải biết gì về ẩn danh (spec § 7)
      const partnerId = this.partnerIdOf(room.session, user.userId);
      await Promise.all(
        (
          [
            [user.userId, 'me'],
            [partnerId, 'partner'],
          ] as const
        ).map(([recipientId, senderRole]) => {
          const envelope: RealtimeEnvelope<SoulMessageEventData> = {
            event: RealtimeEvents.SoulMessage,
            data: {
              sessionId,
              messageId: message.id,
              senderRole,
              content: message.content,
              sentAt: message.createdAt.toISOString(),
            },
          };
          return publishRealtimeEvent(
            this.redis,
            this.logger,
            recipientId,
            envelope,
          );
        }),
      );
      return message;
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      const existing = await this.messageRepo.findOneBy({
        idempotencyKey: prefixedKey,
      });
      if (
        existing &&
        existing.sessionId === sessionId &&
        existing.content === dto.content
      ) {
        return existing; // replay — client retry sau timeout mạng
      }
      throw new DomainException(
        SoulMatchErrors.MESSAGE_IDEMPOTENCY_CONFLICT,
        'Idempotency-Key đã dùng cho 1 message khác nội dung',
        HttpStatus.CONFLICT,
      );
    }
  }

  /** List message theo cursor seq (keyset) — đọc được ở phase chatting/rating, khoá khi closed. */
  async listMessages(
    user: AuthenticatedUser,
    sessionId: string,
    limit: number,
    cursor?: string,
  ): Promise<CursorPage<SoulChatMessage>> {
    const room = await this.getRoomForMember(user, sessionId);
    if (room.phase === SoulRoomPhase.Closed) {
      // docs/02: chat ẩn danh khoá khi session kết thúc — dữ liệu giữ cho T&S, không expose lại
      throw new DomainException(
        SoulMatchErrors.CHAT_NOT_OPEN,
        'Phòng đã đóng — lịch sử chat ẩn danh không đọc lại được',
        HttpStatus.CONFLICT,
        { phase: room.phase },
      );
    }

    let afterSeq = '0';
    if (cursor) {
      const payload = decodeCursor<{ seq?: unknown }>(cursor);
      if (
        !payload ||
        typeof payload.seq !== 'string' ||
        !/^\d+$/.test(payload.seq)
      ) {
        throw new DomainException(
          SoulMatchErrors.CURSOR_INVALID,
          'Cursor không hợp lệ',
          HttpStatus.BAD_REQUEST,
        );
      }
      afterSeq = payload.seq;
    }

    const rows = await this.messageRepo
      .createQueryBuilder('m')
      .where('m.sessionId = :sessionId', { sessionId })
      .andWhere('m.seq > :afterSeq', { afterSeq })
      .orderBy('m.seq', 'ASC')
      .take(limit + 1)
      .getMany();
    return buildCursorPage(rows, limit, (last) => ({ seq: last.seq }));
  }

  /**
   * Rating 2 chiều — điểm nhạy race duy nhất của module (spec § 3): lock session row
   * FOR UPDATE serialize 2 rater (READ COMMITTED — không lock thì 2 "like" song song
   * không thấy nhau, cả 2 cùng kết luận "chưa đủ 2 like"); check mutual + tạo Friendship
   * nằm trong CÙNG transaction với insert rating; unique DB là chốt chặn cuối.
   */
  async rate(
    user: AuthenticatedUser,
    sessionId: string,
    dto: RateSessionDto,
  ): Promise<RateResult> {
    const room = await this.getRoomForMember(user, sessionId);
    if (room.phase === SoulRoomPhase.Closed) {
      throw new DomainException(
        SoulMatchErrors.RATING_NOT_OPEN,
        'Hết cửa sổ đánh giá',
        HttpStatus.CONFLICT,
      );
    }
    const partnerId = this.partnerIdOf(room.session, user.userId);

    let result: RateResult;
    let newlyMatched = false;
    try {
      result = await this.dataSource.transaction(async (manager) => {
        // Serialize 2 rater trên session row — chỉ lock, KHÔNG ghi (quyền ghi thuộc Matching)
        await manager.findOne(MatchSession, {
          where: { id: sessionId },
          lock: { mode: 'pessimistic_write' },
        });

        const existing = await manager.findOneBy(SoulMatchRating, {
          sessionId,
          raterUserId: user.userId,
        });
        if (existing) {
          this.assertSameVerdict(existing.verdict, dto.verdict);
          return {
            verdict: existing.verdict,
            matched: await this.friendService.areFriends(
              user.userId,
              partnerId,
            ),
          };
        }

        await manager.save(
          manager.create(SoulMatchRating, {
            sessionId,
            raterUserId: user.userId,
            verdict: dto.verdict,
          }),
        );

        // Đã là bạn từ session trước → matched luôn đúng, không tạo lại
        let matched = await this.friendService.areFriends(
          user.userId,
          partnerId,
        );
        if (dto.verdict === SoulMatchVerdict.Like && !matched) {
          const partnerRating = await manager.findOneBy(SoulMatchRating, {
            sessionId,
            raterUserId: partnerId,
          });
          if (partnerRating?.verdict === SoulMatchVerdict.Like) {
            const { created } = await this.friendService.ensureFriendship(
              manager,
              user.userId,
              partnerId,
              FriendshipSource.SoulMatch,
            );
            newlyMatched = created;
            matched = true;
          }
        }
        return { verdict: dto.verdict, matched };
      });
    } catch (err) {
      // Double-submit song song CÙNG user: bên thua unique (session, rater) → replay/409
      if (!isUniqueViolation(err)) throw err;
      const existing = await this.ratingRepo.findOneBy({
        sessionId,
        raterUserId: user.userId,
      });
      if (!existing) throw err;
      this.assertSameVerdict(existing.verdict, dto.verdict);
      return {
        verdict: existing.verdict,
        matched: await this.friendService.areFriends(user.userId, partnerId),
      };
    }

    // Realtime SAU khi transaction commit — best-effort, replay không bắn lại (spec § 7)
    if (newlyMatched) {
      const envelope: RealtimeEnvelope<SoulMatchedEventData> = {
        event: RealtimeEvents.SoulMatched,
        data: { sessionId },
      };
      await Promise.all(
        [user.userId, partnerId].map((uid) =>
          publishRealtimeEvent(this.redis, this.logger, uid, envelope),
        ),
      );
    }
    return result;
  }

  /** Profile đối phương — CHỈ sau khi match (Friendship là nguồn sự thật unlock, spec § 2). */
  async getPartnerProfile(
    user: AuthenticatedUser,
    sessionId: string,
  ): Promise<PublicProfileDto> {
    const room = await this.getRoomForMember(user, sessionId);
    const partnerId = this.partnerIdOf(room.session, user.userId);
    if (!(await this.friendService.areFriends(user.userId, partnerId))) {
      throw new DomainException(
        SoulMatchErrors.PARTNER_LOCKED,
        'Profile đối phương chỉ mở khi cả 2 cùng "Thích"',
        HttpStatus.FORBIDDEN,
      );
    }
    return PublicProfileDto.from(
      await this.userService.getByIdOrThrow(partnerId),
    );
  }

  // ---------- nội bộ ----------

  /**
   * Session tồn tại + caller là thành viên (gộp 404 — không làm oracle dò sessionId,
   * docs/10 § 10.1.D) + phòng hợp lệ (soul, đã đủ 2 confirm) rồi derive phase theo giờ server.
   */
  private async getRoomForMember(
    user: AuthenticatedUser,
    sessionId: string,
  ): Promise<SoulRoomView> {
    const session = await this.matchingService.findSessionById(sessionId);
    if (
      !session ||
      (session.userAId !== user.userId && session.userBId !== user.userId)
    ) {
      throw new DomainException(
        SoulMatchErrors.SESSION_NOT_FOUND,
        'Không tìm thấy session',
        HttpStatus.NOT_FOUND,
      );
    }
    if (
      session.matchType !== MatchType.Soul ||
      session.status !== MatchSessionStatus.Confirmed
    ) {
      throw new DomainException(
        SoulMatchErrors.CHAT_NOT_OPEN,
        'Phòng chat chỉ mở khi session soul đã đủ 2 bên xác nhận',
        HttpStatus.CONFLICT,
      );
    }
    if (!session.confirmedAAt || !session.confirmedBAt) {
      throw new Error(
        `Session ${session.id} confirmed nhưng thiếu confirmedAAt/confirmedBAt — dữ liệu hỏng`,
      );
    }

    const confirmedAt = new Date(
      Math.max(session.confirmedAAt.getTime(), session.confirmedBAt.getTime()),
    );
    const chatSeconds = this.config.getOrThrow('SOUL_CHAT_DURATION_SECONDS', {
      infer: true,
    });
    const ratingSeconds = this.config.getOrThrow('SOUL_RATING_WINDOW_SECONDS', {
      infer: true,
    });
    const chatEndsAt = new Date(confirmedAt.getTime() + chatSeconds * 1000);
    const ratingEndsAt = new Date(chatEndsAt.getTime() + ratingSeconds * 1000);
    const now = Date.now();
    const phase =
      now < chatEndsAt.getTime()
        ? SoulRoomPhase.Chatting
        : now < ratingEndsAt.getTime()
          ? SoulRoomPhase.Rating
          : SoulRoomPhase.Closed;
    return { session, chatEndsAt, ratingEndsAt, phase };
  }

  private partnerIdOf(session: MatchSession, userId: string): string {
    return session.userAId === userId ? session.userBId : session.userAId;
  }

  /** Rating immutable — replay cùng verdict là idempotent, khác verdict là 409 (docs/10 § Soul Match). */
  private assertSameVerdict(
    existing: SoulMatchVerdict,
    incoming: SoulMatchVerdict,
  ): void {
    if (existing !== incoming) {
      throw new DomainException(
        SoulMatchErrors.RATING_CONFLICT,
        `Đã đánh giá '${existing}' — verdict không đổi được`,
        HttpStatus.CONFLICT,
      );
    }
  }
}
