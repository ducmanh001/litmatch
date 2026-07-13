import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { RealtimeEvents } from '@litmatch/common-dtos';
import { DomainException } from '@litmatch/common-exceptions';
import { DataSource, Repository } from 'typeorm';

import { canonicalPair } from '../../common/entities/canonical-pair';
import { publishRealtimeEvent } from '../../common/realtime/publish-realtime';
import { isUniqueViolation } from '../../database/postgres-errors';
import { FriendService } from '../friend';
import { MovieSessionActiveParticipant } from './entities/movie-session-active-participant.entity';
import {
  MovieSession,
  MovieSessionEndReason,
  MovieSessionStatus,
} from './entities/movie-session.entity';
import { MovieMatchErrors } from './movie-match.errors';
import { MOVIE_MATCH_REDIS } from './redis/movie-match-redis.provider';

import type {
  MovieSessionEndedEventData,
  MovieSessionStartedEventData,
  MovieStateChangedEventData,
  RealtimeEnvelope,
} from '@litmatch/common-dtos';
import type Redis from 'ioredis';
import type { CoreApiEnv } from '../../config/env.validation';

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
    private readonly friendService: FriendService,
    private readonly config: ConfigService<CoreApiEnv, true>,
    @Inject(MOVIE_MATCH_REDIS) private readonly redis: Redis,
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

  // ---------- nội bộ ----------

  private async findActiveByPair(
    userLowId: string,
    userHighId: string,
  ): Promise<MovieSession | null> {
    return this.sessionRepo.findOneBy({
      userLowId,
      userHighId,
      status: MovieSessionStatus.Active,
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
