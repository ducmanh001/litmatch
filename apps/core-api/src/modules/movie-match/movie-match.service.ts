import { randomUUID } from 'node:crypto';

import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import {
  buildCursorPage,
  decodeCursor,
  isValidSeqCursor,
  RealtimeEvents,
} from '@litmatch/common-dtos';
import { DomainException } from '@litmatch/common-exceptions';
import { DataSource, EntityManager, Repository } from 'typeorm';

import { canonicalPair } from '../../common/entities/canonical-pair';
import { fnv1aHash } from '../../common/hash/fnv1a';
import { publishRealtimeEvent } from '../../common/realtime/publish-realtime';
import { lockAdvisoryXact } from '../../database/advisory-lock';
import { isUniqueViolation } from '../../database/postgres-errors';
import { FriendService, FriendshipSource } from '../friend';
import { SafetyService } from '../safety';
import {
  MovieMatchQueueEntry,
  MovieSessionMessage,
} from './entities/movie-match-anon.entities';
import { MovieSessionActiveParticipant } from './entities/movie-session-active-participant.entity';
import {
  MovieMatchOutcome,
  MovieMatchRating,
  MovieSession,
  MovieSessionEndReason,
  MovieSessionMode,
  MovieSessionStatus,
} from './entities/movie-session.entity';
import {
  MOVIE_MATCH_REACTIONS,
  movieMessageIdempotencyKey,
} from './movie-match.constants';
import { MovieMatchErrors } from './movie-match.errors';
import { MOVIE_MATCH_REDIS } from './redis/movie-match-redis.provider';

import type {
  CursorPage,
  MovieReactionSentEventData,
  MovieSessionEndedEventData,
  MovieSessionStartedEventData,
  MovieStateChangedEventData,
  RealtimeEnvelope,
} from '@litmatch/common-dtos';
import type { RealtimePublisherPort } from '../../common/realtime/realtime-publisher.port';
import type { CoreApiEnv } from '../../config/env.validation';

/** Số ứng viên tối đa xét mỗi lượt ghép ẩn danh (mỗi ứng viên: giành hàng + kiểm active + canPair). */
const ANON_MATCH_MAX_CANDIDATES = 20;
/** Số entry quá hạn dọn mỗi lượt join — chặn để một lượt không gánh cả backlog. */
const ANON_STALE_PURGE_BATCH = 50;

/** Phase client của flow ẩn danh — map 1-1 với 4 state màn hình movie-match.html. */
export enum MovieMatchClientState {
  Idle = 'idle',
  Queued = 'queued',
  Watching = 'watching',
  Rating = 'rating',
  Completed = 'completed',
}

export interface MovieMatchAnonStateView {
  state: MovieMatchClientState;
  queuedAt?: string;
  sessionId?: string;
  videoUrl?: string;
  positionSeconds?: number;
  isPlaying?: boolean;
  positionUpdatedAt?: string;
  expiresAt?: string;
  myRating?: MovieMatchRating;
  opponentRated?: boolean;
  outcome?: MovieMatchOutcome;
  /** CHỈ xuất hiện khi outcome=matched — trước đó 2 bên ẩn danh hoàn toàn. */
  partnerUserId?: string;
}

/**
 * Facade của Movie Match module (docs/services/movie-match-service.md): phiên xem chung
 * giữa 2 user ĐÃ LÀ BẠN, server chỉ giữ 1 nguồn sự thật cho playback state (không phải media
 * pipeline — client tự phát video từ URL whitelist). KHÔNG có bảng message riêng, chat đi
 * thẳng qua `FriendService`/`Conversation` (spec § 2).
 */
@Injectable()
export class MovieMatchService {
  private readonly logger = new Logger(MovieMatchService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(MovieSession)
    private readonly sessionRepo: Repository<MovieSession>,
    @InjectRepository(MovieSessionMessage)
    private readonly messageRepo: Repository<MovieSessionMessage>,
    private readonly friendService: FriendService,
    private readonly safetyService: SafetyService,
    private readonly config: ConfigService<CoreApiEnv, true>,
    @Inject(MOVIE_MATCH_REDIS) private readonly redis: RealtimePublisherPort,
  ) {}

  /**
   * Tạo phiên xem chung — chỉ giữa 2 người đã là bạn (spec § 2). Idempotent theo cặp: đã
   * active đúng cặp này → trả lại session cũ; active với CẶP KHÁC → 409
   * `MOVIE_SESSION_ALREADY_ACTIVE` (không tự ý kết thúc session cũ thay user — spec § 3).
   * Race an toàn nhờ PK `userId` của `MovieSessionActiveParticipant` (migration 1753200000000,
   * xem comment ở entity đó về lý do KHÔNG dùng 2 partial unique index đơn cột): cố INSERT cả
   * `MovieSession` + 2 dòng participant TRONG 1 TRANSACTION → bắt unique violation → đọc lại để
   * phân biệt "cặp trùng, replay" với "user đã active cặp khác" (cùng pattern chuẩn docs/05 § 5.10).
   */
  async createSession(
    userId: string,
    friendUserId: string,
    videoUrl: string,
  ): Promise<MovieSession> {
    this.assertValidVideoUrl(videoUrl);

    if (userId === friendUserId) {
      throw new DomainException(
        MovieMatchErrors.NOT_FRIEND,
        'Không thể xem chung với chính mình',
        HttpStatus.NOT_FOUND,
      );
    }
    if (!(await this.friendService.areFriends(userId, friendUserId))) {
      throw new DomainException(
        MovieMatchErrors.NOT_FRIEND,
        'Không phải bạn của bạn',
        HttpStatus.NOT_FOUND,
      );
    }

    const [userLowId, userHighId] = canonicalPair(userId, friendUserId);

    const existing = await this.findActiveByPair(userLowId, userHighId);
    if (existing) return existing;

    const now = new Date();
    let created: MovieSession;
    try {
      created = await this.dataSource.transaction(async (manager) => {
        const session = await manager.save(
          manager.create(MovieSession, {
            userLowId,
            userHighId,
            videoUrl,
            positionSeconds: 0,
            isPlaying: false,
            positionUpdatedAt: now,
            status: MovieSessionStatus.Active,
          }),
        );
        // PK userId chặn: bất kỳ user nào trong cặp đã active session KHÁC (dù ở vai trò
        // low hay high) → unique violation → rollback CẢ transaction (không mồ côi row).
        await manager.insert(MovieSessionActiveParticipant, [
          { userId: userLowId, sessionId: session.id },
          { userId: userHighId, sessionId: session.id },
        ]);
        return session;
      });
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      // Race: request khác vừa ghi trước — đọc lại để phân biệt "đúng cặp" (idempotent replay)
      // với "user đã active cặp khác" (409, không đoán ý user).
      const raced = await this.findActiveByPair(userLowId, userHighId);
      if (raced) return raced;
      throw new DomainException(
        MovieMatchErrors.ALREADY_ACTIVE,
        'Đang có phiên xem chung khác đang active',
        HttpStatus.CONFLICT,
      );
    }

    const envelope: RealtimeEnvelope<MovieSessionStartedEventData> = {
      event: RealtimeEvents.MovieSessionStarted,
      data: {
        sessionId: created.id,
        videoUrl: created.videoUrl,
        initiatorUserId: userId,
      },
    };
    await Promise.all(
      [userLowId, userHighId].map((uid) =>
        publishRealtimeEvent(this.redis, this.logger, uid, envelope),
      ),
    );
    return created;
  }

  /**
   * Cập nhật playback state — KHÔNG lock (spec § 4: state UX ephemeral, không phải dữ liệu tài
   * chính, sai lệch vài giây chấp nhận được). 1 câu UPDATE đơn giản (last-write-wins) rồi publish
   * cho người còn lại.
   */
  async updateState(
    userId: string,
    sessionId: string,
    positionSeconds: number,
    isPlaying: boolean,
  ): Promise<MovieSession> {
    const session = await this.getSessionForParticipant(userId, sessionId);
    if (session.status === MovieSessionStatus.Ended) {
      throw new DomainException(
        MovieMatchErrors.ENDED,
        'Phiên xem chung đã kết thúc',
        HttpStatus.CONFLICT,
      );
    }

    const positionUpdatedAt = new Date();
    await this.sessionRepo.update(
      { id: sessionId },
      { positionSeconds, isPlaying, positionUpdatedAt },
    );
    const updated: MovieSession = {
      ...session,
      positionSeconds,
      isPlaying,
      positionUpdatedAt,
    };

    const envelope: RealtimeEnvelope<MovieStateChangedEventData> = {
      event: RealtimeEvents.MovieStateChanged,
      data: {
        sessionId,
        videoUrl: session.videoUrl,
        positionSeconds,
        isPlaying,
        positionUpdatedAt: positionUpdatedAt.toISOString(),
      },
    };
    await Promise.all(
      [session.userLowId, session.userHighId].map((uid) =>
        publishRealtimeEvent(this.redis, this.logger, uid, envelope),
      ),
    );
    return updated;
  }

  /**
   * 1 trong 2 bên chủ động kết thúc (`left`). Gọi lại trên session đã `ended` là no-op idempotent
   * (trả nguyên trạng, không throw) — hành động không có side-effect tiền nên lặp lại vô hại.
   * Xoá 2 dòng `MovieSessionActiveParticipant` CÙNG transaction với đổi status — giải phóng cả
   * 2 user để họ có thể mở phiên xem chung mới (với bất kỳ ai) ngay sau khi session này kết thúc.
   */
  async endSession(userId: string, sessionId: string): Promise<MovieSession> {
    const session = await this.getSessionForParticipant(userId, sessionId);
    if (session.status === MovieSessionStatus.Ended) return session;

    const endedAt = new Date();
    await this.dataSource.transaction(async (manager) => {
      await manager.update(
        MovieSession,
        { id: sessionId },
        {
          status: MovieSessionStatus.Ended,
          endedAt,
          endReason: MovieSessionEndReason.Left,
        },
      );
      await manager.delete(MovieSessionActiveParticipant, {
        sessionId,
      });
    });
    const updated: MovieSession = {
      ...session,
      status: MovieSessionStatus.Ended,
      endedAt,
      endReason: MovieSessionEndReason.Left,
    };

    const envelope: RealtimeEnvelope<MovieSessionEndedEventData> = {
      event: RealtimeEvents.MovieSessionEnded,
      data: { sessionId, reason: MovieSessionEndReason.Left },
    };
    await Promise.all(
      [session.userLowId, session.userHighId].map((uid) =>
        publishRealtimeEvent(this.redis, this.logger, uid, envelope),
      ),
    );
    return updated;
  }

  /** Poll fallback — cùng payload dùng cho realtime (spec § 5.4). */
  async getSession(userId: string, sessionId: string): Promise<MovieSession> {
    return this.getSessionForParticipant(userId, sessionId);
  }

  // ---------- flow ghép ẨN DANH (movie-match.html) ----------

  /**
   * Enqueue idempotent rồi thử ghép với entry cũ nhất. KHÔNG có khoá toàn cục: người MỚI hơn giành entry đối tác
   * cũ hơn bằng `FOR UPDATE SKIP LOCKED` (`tryMatchAnon`) nên các lượt join của những user khác nhau không xếp
   * hàng sau nhau; PK queue + PK active-participant là chốt DB cuối. Hai người vào cùng một lúc có thể bỏ lỡ
   * nhau (mỗi bên thấy bên kia đang bị khoá) — lượt poll `getAnonCurrent` tiếp theo thử ghép lại. Server tự chọn
   * video từ config `MOVIE_MATCH_ANON_VIDEO_URLS` — client không gửi URL.
   *
   * Các lượt join của CÙNG một user (bấm đúp, hai tab) được tuần tự hoá bằng khoá advisory THEO USER: nếu không,
   * lượt thứ hai đọc "chưa active" trước khi lượt đầu commit rồi chèn lại entry sau khi user đã được ghép — trả
   * `queued` cho user đã active và để lại entry thừa trong hàng đợi.
   */
  async joinAnonQueue(userId: string): Promise<MovieMatchAnonStateView> {
    return this.dataSource.transaction(async (manager) => {
      await lockAdvisoryXact(manager, 'movie-match-join', userId);
      await this.expireAnonForUser(manager, userId);

      const activeState = await this.anonActiveState(manager, userId);
      if (activeState) return activeState;

      await this.purgeStaleAnonEntries(manager);
      await manager
        .createQueryBuilder()
        .insert()
        .into(MovieMatchQueueEntry)
        .values({ userId })
        .orIgnore()
        .execute();
      return this.tryMatchAnon(manager, userId);
    });
  }

  /** REST recovery/poll state — lazy expiry deadline server. */
  async getAnonCurrent(userId: string): Promise<MovieMatchAnonStateView> {
    return this.dataSource.transaction(async (manager) => {
      await this.expireAnonForUser(manager, userId);
      const active = await this.anonActiveState(manager, userId);
      if (active) return active;

      const queued = await manager.findOneBy(MovieMatchQueueEntry, { userId });
      if (!queued) return { state: MovieMatchClientState.Idle };
      const maxWaitSeconds = this.config.getOrThrow(
        'MOVIE_MATCH_QUEUE_MAX_WAIT_SECONDS',
        { infer: true },
      );
      if (queued.queuedAt.getTime() + maxWaitSeconds * 1000 <= Date.now()) {
        await manager.delete(MovieMatchQueueEntry, { userId });
        return { state: MovieMatchClientState.Idle };
      }
      // Tự chữa: hai người join cùng lúc có thể bỏ lỡ nhau (SKIP LOCKED) — mỗi lượt poll thử ghép lại.
      return this.tryMatchAnon(manager, userId);
    });
  }

  /** Huỷ queue hoặc dismiss session (đang active → huỷ cho CẢ HAI, không để bên kia chờ vô hạn). */
  async dismissAnonCurrent(userId: string): Promise<MovieMatchAnonStateView> {
    return this.dataSource.transaction(async (manager) => {
      // Không cần khoá toàn cục: nếu entry đang bị một lượt ghép giữ khoá thì DELETE chờ lượt đó commit rồi
      // thấy hàng đã mất và đọc active-participant bên dưới (đã được ghép → huỷ cho cả hai).
      await manager.delete(MovieMatchQueueEntry, { userId });
      const active = await manager.findOneBy(MovieSessionActiveParticipant, {
        userId,
      });
      if (!active) return { state: MovieMatchClientState.Idle };

      const session = await manager.findOne(MovieSession, {
        where: { id: active.sessionId },
        lock: { mode: 'pessimistic_write' },
      });
      if (
        session?.mode === MovieSessionMode.Anonymous &&
        session.status === MovieSessionStatus.Active
      ) {
        this.completeAnonSession(session, MovieMatchOutcome.Cancelled);
        await manager.save(session);
      }
      await manager.delete(MovieSessionActiveParticipant, { userId });
      return { state: MovieMatchClientState.Idle };
    });
  }

  /** Playback update cho phiên ẩn danh — last-write-wins như friend mode, chỉ khi đang xem. */
  async updateAnonState(
    userId: string,
    sessionId: string,
    positionSeconds: number,
    isPlaying: boolean,
  ): Promise<MovieMatchAnonStateView> {
    return this.dataSource.transaction(async (manager) => {
      const session = await this.lockedAnonSession(manager, userId, sessionId);
      await this.lazyExpireAnon(manager, session);
      if (
        session.status !== MovieSessionStatus.Active ||
        session.watchEndedAt !== null
      ) {
        throw new DomainException(
          MovieMatchErrors.ENDED,
          'Phiên xem đã kết thúc phần xem chung',
          HttpStatus.CONFLICT,
        );
      }
      session.positionSeconds = positionSeconds;
      session.isPlaying = isPlaying;
      session.positionUpdatedAt = new Date();
      await manager.save(session);
      await this.publishAnonPlayback(session);
      return this.anonView(session, userId);
    });
  }

  /** "Kết thúc" — sang phase rating cho CẢ HAI (idempotent); playback dừng. */
  async endAnonWatch(
    userId: string,
    sessionId: string,
  ): Promise<MovieMatchAnonStateView> {
    return this.dataSource.transaction(async (manager) => {
      const session = await this.lockedAnonSession(manager, userId, sessionId);
      await this.lazyExpireAnon(manager, session);
      if (
        session.status === MovieSessionStatus.Active &&
        session.watchEndedAt === null
      ) {
        session.watchEndedAt = new Date();
        session.isPlaying = false;
        session.positionUpdatedAt = new Date();
        await manager.save(session);
        await this.publishAnonPlayback(session);
      }
      return this.anonView(session, userId);
    });
  }

  /** Rating một lần (like|boring|rude); mutual-like tạo Friendship + Conversation atomic. */
  async rateAnon(
    userId: string,
    sessionId: string,
    rating: MovieMatchRating,
  ): Promise<MovieMatchAnonStateView> {
    return this.dataSource.transaction(async (manager) => {
      const session = await this.lockedAnonSession(manager, userId, sessionId);
      await this.lazyExpireAnon(manager, session);

      const isLow = session.userLowId === userId;
      const existing = isLow ? session.lowRating : session.highRating;
      if (existing === rating) return this.anonView(session, userId); // replay
      if (existing) {
        throw new DomainException(
          MovieMatchErrors.RATING_CONFLICT,
          'Không thể đổi đánh giá đã chốt',
          HttpStatus.CONFLICT,
        );
      }
      // Terminal (bên kia đã skip/cancel/expired) mà mình chưa từng rate → session đã đóng
      if (session.status !== MovieSessionStatus.Active) {
        throw new DomainException(
          MovieMatchErrors.ENDED,
          'Phiên đã kết thúc',
          HttpStatus.CONFLICT,
        );
      }
      if (session.watchEndedAt === null) {
        throw new DomainException(
          MovieMatchErrors.RATING_NOT_OPEN,
          'Chỉ đánh giá sau khi phần xem chung kết thúc',
          HttpStatus.CONFLICT,
        );
      }

      if (isLow) session.lowRating = rating;
      else session.highRating = rating;

      if (rating !== MovieMatchRating.Like) {
        this.completeAnonSession(session, MovieMatchOutcome.NotMatched);
      } else if (
        session.lowRating === MovieMatchRating.Like &&
        session.highRating === MovieMatchRating.Like
      ) {
        await this.friendService.ensureFriendship(
          manager,
          session.userLowId,
          session.userHighId,
          FriendshipSource.MovieMatch,
        );
        this.completeAnonSession(session, MovieMatchOutcome.Matched);
      }

      await manager.save(session);
      return this.anonView(session, userId);
    });
  }

  /** Chat ẩn danh trong phiên — idempotent theo key, chỉ khi session chưa terminal. */
  async sendAnonMessage(
    userId: string,
    sessionId: string,
    content: string,
    idempotencyKey: string,
  ): Promise<MovieSessionMessage> {
    const session = await this.anonSessionForParticipant(userId, sessionId);
    if (session.status !== MovieSessionStatus.Active) {
      throw new DomainException(
        MovieMatchErrors.ENDED,
        'Phiên đã kết thúc',
        HttpStatus.CONFLICT,
      );
    }
    const maxLength = this.config.getOrThrow('MOVIE_MATCH_MESSAGE_MAX_LENGTH', {
      infer: true,
    });
    if (content.length > maxLength) {
      throw new DomainException(
        MovieMatchErrors.MESSAGE_TOO_LONG,
        `Message dài quá ${maxLength} ký tự`,
        HttpStatus.UNPROCESSABLE_ENTITY,
        { maxLength },
      );
    }

    const prefixedKey = movieMessageIdempotencyKey(userId, idempotencyKey);
    try {
      return await this.messageRepo.save(
        this.messageRepo.create({
          sessionId,
          senderUserId: userId,
          content,
          idempotencyKey: prefixedKey,
        }),
      );
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      const existing = await this.messageRepo.findOneBy({
        idempotencyKey: prefixedKey,
      });
      if (
        existing &&
        existing.sessionId === sessionId &&
        existing.content === content
      ) {
        return existing; // replay
      }
      throw new DomainException(
        MovieMatchErrors.MESSAGE_IDEMPOTENCY_CONFLICT,
        'Idempotency-Key đã dùng cho 1 message khác nội dung',
        HttpStatus.CONFLICT,
      );
    }
  }

  async listAnonMessages(
    userId: string,
    sessionId: string,
    limit: number,
    cursor?: string,
  ): Promise<CursorPage<MovieSessionMessage>> {
    await this.anonSessionForParticipant(userId, sessionId);
    let afterSeq = '0';
    if (cursor) {
      const payload = decodeCursor<{ seq?: unknown }>(cursor);
      if (!isValidSeqCursor(payload)) {
        throw new DomainException(
          MovieMatchErrors.NOT_FOUND,
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

  /** Reaction ephemeral — realtime-only, whitelist emoji, KHÔNG persist, KHÔNG kèm userId. */
  async sendAnonReaction(
    userId: string,
    sessionId: string,
    emoji: string,
  ): Promise<void> {
    if (!(MOVIE_MATCH_REACTIONS as readonly string[]).includes(emoji)) {
      throw new DomainException(
        MovieMatchErrors.REACTION_INVALID,
        'Reaction không hợp lệ',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    const session = await this.anonSessionForParticipant(userId, sessionId);
    if (session.status !== MovieSessionStatus.Active) {
      throw new DomainException(
        MovieMatchErrors.ENDED,
        'Phiên đã kết thúc',
        HttpStatus.CONFLICT,
      );
    }
    const envelope: RealtimeEnvelope<MovieReactionSentEventData> = {
      event: RealtimeEvents.MovieReactionSent,
      data: { sessionId, emoji },
    };
    await Promise.all(
      [session.userLowId, session.userHighId].map((uid) =>
        publishRealtimeEvent(this.redis, this.logger, uid, envelope),
      ),
    );
  }

  // ---------- nội bộ ----------

  private async findActiveByPair(
    userLowId: string,
    userHighId: string,
  ): Promise<MovieSession | null> {
    // mode=Friend tường minh — 2 người bạn đang tình cờ ghép ẩn danh với nhau KHÔNG được
    // coi là "replay" của phiên xem chung bạn bè (flow/quyền riêng tư khác nhau).
    return this.sessionRepo.findOneBy({
      userLowId,
      userHighId,
      status: MovieSessionStatus.Active,
      mode: MovieSessionMode.Friend,
    });
  }

  /** Tồn tại + caller là participant — gộp 404 (docs/10 § 10.1.D, cùng pattern Friend Chat). */
  private async getSessionForParticipant(
    userId: string,
    sessionId: string,
  ): Promise<MovieSession> {
    const session = await this.sessionRepo.findOneBy({ id: sessionId });
    if (
      !session ||
      (session.userLowId !== userId && session.userHighId !== userId)
    ) {
      throw new DomainException(
        MovieMatchErrors.NOT_FOUND,
        'Không tìm thấy phiên xem chung',
        HttpStatus.NOT_FOUND,
      );
    }
    return session;
  }

  // ---- helper flow ẩn danh ----

  /**
   * Dọn entry quá hạn chờ — có chặn (50 hàng) và `SKIP LOCKED` nên không chặn/không bị chặn bởi lượt ghép khác;
   * `idx_movie_match_queue_order` phục vụ quét theo `queued_at`.
   */
  private async purgeStaleAnonEntries(manager: EntityManager): Promise<void> {
    const maxWaitSeconds = this.config.getOrThrow(
      'MOVIE_MATCH_QUEUE_MAX_WAIT_SECONDS',
      { infer: true },
    );
    await manager.query(
      `DELETE FROM movie_match_queue_entries
        WHERE user_id IN (
          SELECT user_id FROM movie_match_queue_entries
           WHERE queued_at < $1
           ORDER BY queued_at ASC
           LIMIT $2
           FOR UPDATE SKIP LOCKED
        )`,
      [new Date(Date.now() - maxWaitSeconds * 1000), ANON_STALE_PURGE_BATCH],
    );
  }

  /**
   * Một lượt thử ghép cho `userId` (đã có entry). QUY TẮC "người MỚI HƠN giành người CŨ HƠN": chỉ xét các entry cũ
   * hơn mình theo (queued_at, user_id) và giành bằng `FOR UPDATE SKIP LOCKED` (không bao giờ chờ nên không
   * deadlock; ứng viên cũ nhất còn rảnh được chọn trước = FIFO). Không khoá hàng của chính mình khi tìm: nếu
   * mình khoá sớm thì mọi người mới hơn đều thấy mình "đang bị khoá" và bỏ qua → cả hàng đợi poll cùng lúc sẽ
   * không ai ghép được. Sau khi chọn được đối tác mới xoá entry của mình (DELETE chờ nếu một lượt mới hơn đang
   * giành mình; lượt đó commit xong thì DELETE không còn hàng → nhả đối tác, dựng lại state). Mọi cạnh chờ đều đi
   * từ cũ sang mới nên không có chu trình. Cặp (cũ, mới) bị bỏ lỡ do khoá tạm thời sẽ được ghép ở lượt poll kế
   * tiếp của người MỚI hơn.
   */
  private async tryMatchAnon(
    manager: EntityManager,
    userId: string,
  ): Promise<MovieMatchAnonStateView> {
    const own = (await manager.query(
      `SELECT queued_at FROM movie_match_queue_entries WHERE user_id = $1`,
      [userId],
    )) as Array<{ queued_at: Date }>;
    const ownEntry = own[0];
    if (ownEntry === undefined) {
      return (
        (await this.anonActiveState(manager, userId)) ?? {
          state: MovieMatchClientState.Idle,
        }
      );
    }

    const maxWaitSeconds = this.config.getOrThrow(
      'MOVIE_MATCH_QUEUE_MAX_WAIT_SECONDS',
      { infer: true },
    );
    const cutoff = new Date(Date.now() - maxWaitSeconds * 1000);
    const skipped: string[] = [];
    let partnerId: string | undefined;
    for (let i = 0; i < ANON_MATCH_MAX_CANDIDATES; i += 1) {
      const rows = (await manager.query(
        // So sánh (queued_at, user_id) NGAY TRONG SQL (đủ độ chính xác micro giây; truyền qua JS Date sẽ cắt
        // về mili giây và hai bên có thể cùng coi nhau là "không cũ hơn").
        `SELECT c.user_id FROM movie_match_queue_entries c
          WHERE (c.queued_at, c.user_id) < (
                  SELECT o.queued_at, o.user_id FROM movie_match_queue_entries o WHERE o.user_id = $1
                )
            AND c.queued_at >= $2 AND c.user_id <> ALL($3::uuid[])
          ORDER BY c.queued_at ASC, c.user_id ASC
          LIMIT 1
          FOR UPDATE OF c SKIP LOCKED`,
        [userId, cutoff, skipped],
      )) as Array<{ user_id: string }>;
      const candidateId = rows[0]?.user_id;
      if (candidateId === undefined) break;

      const candidateActive = await manager.findOneBy(
        MovieSessionActiveParticipant,
        { userId: candidateId },
      );
      if (candidateActive) {
        await manager.delete(MovieMatchQueueEntry, { userId: candidateId });
        skipped.push(candidateId);
        continue;
      }
      // Re-check block/report ĐÚNG LÚC ghép — không tin state thời điểm enqueue. Chạy trên transaction này.
      if (await this.safetyService.canPair(userId, candidateId, manager)) {
        partnerId = candidateId;
        break;
      }
      skipped.push(candidateId);
    }

    if (partnerId === undefined) {
      return {
        state: MovieMatchClientState.Queued,
        queuedAt: ownEntry.queued_at.toISOString(),
      };
    }

    // Xoá entry của chính mình để "chốt" lượt ghép. Nếu một lượt mới hơn đang giành mình thì DELETE chờ nó
    // commit rồi không còn hàng → bỏ lượt này (nhả đối tác) và dựng lại state từ bảng active.
    const claimed = await manager.delete(MovieMatchQueueEntry, { userId });
    if (!claimed.affected) {
      return (
        (await this.anonActiveState(manager, userId)) ?? {
          state: MovieMatchClientState.Idle,
        }
      );
    }
    const session = await this.createAnonSession(manager, userId, partnerId);
    await manager.delete(MovieMatchQueueEntry, { userId: partnerId });
    await manager.insert(MovieSessionActiveParticipant, [
      { userId, sessionId: session.id },
      { userId: partnerId, sessionId: session.id },
    ]);
    return this.anonView(session, userId);
  }

  private async createAnonSession(
    manager: EntityManager,
    userAId: string,
    userBId: string,
  ): Promise<MovieSession> {
    const pool = this.config
      .getOrThrow('MOVIE_MATCH_ANON_VIDEO_URLS', { infer: true })
      .split(',')
      .map((url) => url.trim())
      .filter((url) => url.length > 0);
    if (pool.length === 0) {
      throw new DomainException(
        MovieMatchErrors.ANON_VIDEO_POOL_EMPTY,
        'Chưa cấu hình video cho Movie Match ẩn danh',
        HttpStatus.CONFLICT,
      );
    }

    const id = randomUUID();
    const [userLowId, userHighId] = canonicalPair(userAId, userBId);
    const durationSeconds = this.config.getOrThrow(
      'MOVIE_MATCH_ANON_DURATION_SECONDS',
      { infer: true },
    );
    const now = new Date();
    return manager.save(
      manager.create(MovieSession, {
        id,
        userLowId,
        userHighId,
        // Server chọn video deterministic theo session — client không gửi/không chọn được
        videoUrl: pool[fnv1aHash(id) % pool.length],
        positionSeconds: 0,
        isPlaying: false,
        positionUpdatedAt: now,
        status: MovieSessionStatus.Active,
        mode: MovieSessionMode.Anonymous,
        expiresAt: new Date(now.getTime() + durationSeconds * 1000),
        watchEndedAt: null,
        lowRating: null,
        highRating: null,
        outcome: null,
      }),
    );
  }

  private async anonActiveState(
    manager: EntityManager,
    userId: string,
  ): Promise<MovieMatchAnonStateView | null> {
    const active = await manager.findOneBy(MovieSessionActiveParticipant, {
      userId,
    });
    if (!active) return null;
    const session = await manager.findOneBy(MovieSession, {
      id: active.sessionId,
    });
    if (!session) {
      await manager.delete(MovieSessionActiveParticipant, { userId });
      return null;
    }
    // Đang trong phiên xem chung BẠN BÈ → flow ẩn danh coi như bận (không thể queue)
    if (session.mode !== MovieSessionMode.Anonymous) {
      throw new DomainException(
        MovieMatchErrors.ALREADY_ACTIVE,
        'Đang có phiên xem chung khác đang active',
        HttpStatus.CONFLICT,
      );
    }
    return this.anonView(session, userId);
  }

  private async expireAnonForUser(
    manager: EntityManager,
    userId: string,
  ): Promise<void> {
    const active = await manager.findOneBy(MovieSessionActiveParticipant, {
      userId,
    });
    if (!active) return;
    const session = await manager.findOne(MovieSession, {
      where: { id: active.sessionId },
      lock: { mode: 'pessimistic_write' },
    });
    if (session) await this.lazyExpireAnon(manager, session);
  }

  /** Hết giờ xem → mở phase rating (KHÔNG terminal — cả hai vẫn được đánh giá). */
  private async lazyExpireAnon(
    manager: EntityManager,
    session: MovieSession,
  ): Promise<void> {
    if (
      session.mode === MovieSessionMode.Anonymous &&
      session.status === MovieSessionStatus.Active &&
      session.watchEndedAt === null &&
      session.expiresAt !== null &&
      session.expiresAt.getTime() <= Date.now()
    ) {
      session.watchEndedAt = session.expiresAt;
      session.isPlaying = false;
      await manager.save(session);
    }
  }

  private async lockedAnonSession(
    manager: EntityManager,
    userId: string,
    sessionId: string,
  ): Promise<MovieSession> {
    const session = await manager.findOne(MovieSession, {
      where: { id: sessionId },
      lock: { mode: 'pessimistic_write' },
    });
    if (
      !session ||
      session.mode !== MovieSessionMode.Anonymous ||
      (session.userLowId !== userId && session.userHighId !== userId)
    ) {
      throw new DomainException(
        MovieMatchErrors.NOT_FOUND,
        'Không tìm thấy phiên xem chung',
        HttpStatus.NOT_FOUND,
      );
    }
    return session;
  }

  private async anonSessionForParticipant(
    userId: string,
    sessionId: string,
  ): Promise<MovieSession> {
    const session = await this.sessionRepo.findOneBy({ id: sessionId });
    if (
      !session ||
      session.mode !== MovieSessionMode.Anonymous ||
      (session.userLowId !== userId && session.userHighId !== userId)
    ) {
      throw new DomainException(
        MovieMatchErrors.NOT_FOUND,
        'Không tìm thấy phiên xem chung',
        HttpStatus.NOT_FOUND,
      );
    }
    return session;
  }

  private completeAnonSession(
    session: MovieSession,
    outcome: MovieMatchOutcome,
  ): void {
    session.status = MovieSessionStatus.Ended;
    session.endedAt = new Date();
    session.outcome = outcome;
    session.watchEndedAt ??= new Date();
    session.isPlaying = false;
  }

  private async publishAnonPlayback(session: MovieSession): Promise<void> {
    const envelope: RealtimeEnvelope<MovieStateChangedEventData> = {
      event: RealtimeEvents.MovieStateChanged,
      data: {
        sessionId: session.id,
        videoUrl: session.videoUrl,
        positionSeconds: session.positionSeconds,
        isPlaying: session.isPlaying,
        positionUpdatedAt: session.positionUpdatedAt.toISOString(),
      },
    };
    await Promise.all(
      [session.userLowId, session.userHighId].map((uid) =>
        publishRealtimeEvent(this.redis, this.logger, uid, envelope),
      ),
    );
  }

  private anonView(
    session: MovieSession,
    userId: string,
  ): MovieMatchAnonStateView {
    const isLow = session.userLowId === userId;
    const myRating = isLow ? session.lowRating : session.highRating;
    const opponentRating = isLow ? session.highRating : session.lowRating;
    const terminal = session.status === MovieSessionStatus.Ended;

    const state = terminal
      ? MovieMatchClientState.Completed
      : session.watchEndedAt !== null
        ? MovieMatchClientState.Rating
        : MovieMatchClientState.Watching;

    return {
      state,
      sessionId: session.id,
      videoUrl: session.videoUrl,
      positionSeconds: session.positionSeconds,
      isPlaying: session.isPlaying,
      positionUpdatedAt: session.positionUpdatedAt.toISOString(),
      ...(session.expiresAt
        ? { expiresAt: session.expiresAt.toISOString() }
        : {}),
      ...(myRating ? { myRating } : {}),
      opponentRated: opponentRating !== null,
      ...(session.outcome ? { outcome: session.outcome } : {}),
      // Ẩn danh tới khi matched — chỉ mutual-like mới mở danh tính
      ...(session.outcome === MovieMatchOutcome.Matched
        ? { partnerUserId: isLow ? session.userHighId : session.userLowId }
        : {}),
    };
  }

  /**
   * Whitelist domain qua `new URL()` + so khớp hostname CHÍNH XÁC hoặc subdomain thật
   * (`hostname === host || hostname.endsWith('.' + host)`) — KHÔNG regex/substring match, tránh
   * bypass kiểu `youtube.com.evil.com` (docs/10 § Movie Match).
   */
  private assertValidVideoUrl(videoUrl: string): void {
    const maxLength = this.config.getOrThrow('MOVIE_MATCH_URL_MAX_LENGTH', {
      infer: true,
    });
    if (videoUrl.length > maxLength) {
      throw new DomainException(
        MovieMatchErrors.INVALID_VIDEO_URL,
        `videoUrl dài quá ${maxLength} ký tự`,
        HttpStatus.UNPROCESSABLE_ENTITY,
        { maxLength },
      );
    }

    let url: URL;
    try {
      url = new URL(videoUrl);
    } catch {
      throw new DomainException(
        MovieMatchErrors.INVALID_VIDEO_URL,
        'videoUrl không hợp lệ',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      throw new DomainException(
        MovieMatchErrors.INVALID_VIDEO_URL,
        'videoUrl phải dùng http/https',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    const hostname = url.hostname.toLowerCase();
    const allowedHosts = this.config
      .getOrThrow('MOVIE_MATCH_ALLOWED_VIDEO_HOSTS', { infer: true })
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .filter((h) => h.length > 0);
    const allowed = allowedHosts.some(
      (host) => hostname === host || hostname.endsWith(`.${host}`),
    );
    if (!allowed) {
      throw new DomainException(
        MovieMatchErrors.INVALID_VIDEO_URL,
        'Domain video không nằm trong danh sách được phép',
        HttpStatus.UNPROCESSABLE_ENTITY,
        { allowedHosts },
      );
    }
  }
}
