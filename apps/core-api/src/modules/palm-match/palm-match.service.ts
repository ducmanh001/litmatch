import { randomUUID } from 'node:crypto';

import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DomainException } from '@litmatch/common-exceptions';
import { DataSource, EntityManager, Repository } from 'typeorm';

import { canonicalPair } from '../../common/entities/canonical-pair';
import { fnv1aHash } from '../../common/hash/fnv1a';
import { todayUtc } from '../../common/date/utc-date';
import {
  PALM_MATCH_ADVISORY_LOCK_KEY,
  PALM_ZODIAC_SIGNS,
  palmMatchSeedInput,
} from './palm-match.constants';
import { PalmMatchClientState } from './dto/palm-match.dtos';
import {
  PalmMatchActiveParticipant,
  PalmMatchOutcome,
  PalmMatchQueueEntry,
  PalmMatchRating,
  PalmMatchSession,
  PalmMatchSessionStatus,
} from './entities/palm-match-session.entity';
import {
  PalmMatchCategory,
  PalmReadingTemplate,
} from './entities/palm-reading-template.entity';
import { PalmMatchErrors } from './palm-match.errors';
import { FriendService, FriendshipSource } from '../friend';
import { SafetyService } from '../safety';

import type { CoreApiEnv } from '../../config/env.validation';
import type { PalmZodiacSign } from './palm-match.constants';

export interface PalmMatchReading {
  category: PalmMatchCategory;
  content: string;
  forDate: string;
}

export interface PalmMatchStateView {
  state: PalmMatchClientState;
  sessionId?: string;
  queuedAt?: string;
  expiresAt?: string;
  myFlipped?: boolean;
  opponentFlipped?: boolean;
  mySign?: PalmZodiacSign;
  opponentSign?: PalmZodiacSign;
  compatibilityPercent?: number;
  fortune?: string;
  myRating?: PalmMatchRating;
  outcome?: PalmMatchOutcome;
  partnerUserId?: string;
}

/**
 * Facade Palm Match (docs/services/palm-match-service.md): nội dung bói toán giải trí
 * template + random DETERMINISTIC — không phải AI thật, không lưu lịch sử. Cùng
 * `(userId, category, ngày server UTC)` luôn ra cùng 1 kết quả trong ngày; qua ngày khác đổi
 * seed → có thể đổi kết quả. Seed tính hoàn toàn ở server, client không gửi/chọn được (chống
 * "quay số" — docs/10 § Palm Match).
 */
@Injectable()
export class PalmMatchService {
  constructor(
    @InjectRepository(PalmReadingTemplate)
    private readonly templateRepo: Repository<PalmReadingTemplate>,
    private readonly config: ConfigService<CoreApiEnv, true>,
    private readonly dataSource: DataSource,
    private readonly friendService: FriendService,
    private readonly safetyService: SafetyService,
  ) {}

  async getReading(
    userId: string,
    category: PalmMatchCategory,
    targetName?: string,
  ): Promise<PalmMatchReading> {
    const trimmedTargetName = this.assertAndTrimTargetName(targetName);

    // ORDER BY id bắt buộc — không có thì Postgres có thể trả thứ tự khác nhau giữa các lần gọi,
    // phá tính deterministic của `templates[seed % templates.length]` (spec § 3).
    const templates = await this.templateRepo.find({
      where: { category, isActive: true },
      order: { id: 'ASC' },
    });
    if (templates.length === 0) {
      throw new DomainException(
        PalmMatchErrors.CATEGORY_EMPTY,
        `Không có nội dung bói toán cho category '${category}'`,
        HttpStatus.CONFLICT,
      );
    }

    // Tính TẠI ĐÂY, lúc request tới — không cache/tính sẵn (spec § 1).
    const forDate = todayUtc();
    const seed = fnv1aHash(palmMatchSeedInput(userId, category, forDate));
    const template = templates[seed % templates.length];

    return {
      category,
      content: this.applyTargetName(template.content, trimmedTargetName),
      forDate,
    };
  }

  /**
   * Enqueue idempotent rồi thử ghép với entry cũ nhất. Advisory transaction lock serialize phần
   * chọn cặp; PK queue/active-participant vẫn là chốt DB cuối nếu implementation đổi sau này.
   */
  async joinQueue(userId: string): Promise<PalmMatchStateView> {
    return this.dataSource.transaction(async (manager) => {
      await this.lockMatcher(manager);
      await this.expireActiveForUser(manager, userId);

      const activeState = await this.activeState(manager, userId);
      if (activeState) return activeState;

      const queueMaxWaitSeconds = this.config.getOrThrow(
        'PALM_MATCH_QUEUE_MAX_WAIT_SECONDS',
        { infer: true },
      );
      const queueCutoff = new Date(Date.now() - queueMaxWaitSeconds * 1000);
      await manager.query(
        'DELETE FROM palm_match_queue_entries WHERE queued_at < $1',
        [queueCutoff],
      );
      await manager
        .createQueryBuilder()
        .insert()
        .into(PalmMatchQueueEntry)
        .values({ userId })
        .orIgnore()
        .execute();

      const candidates = (await manager.query(
        `SELECT user_id FROM palm_match_queue_entries
         WHERE user_id <> $1 ORDER BY queued_at ASC, user_id ASC LIMIT 20`,
        [userId],
      )) as Array<{ user_id: string }>;

      let partnerId: string | undefined;
      for (const candidate of candidates) {
        const candidateActive = await manager.findOneBy(
          PalmMatchActiveParticipant,
          { userId: candidate.user_id },
        );
        if (candidateActive) {
          await manager.delete(PalmMatchQueueEntry, {
            userId: candidate.user_id,
          });
          continue;
        }
        // Re-check đúng lúc ghép, không tin state ở thời điểm enqueue.
        if (await this.safetyService.canPair(userId, candidate.user_id)) {
          partnerId = candidate.user_id;
          break;
        }
      }

      if (!partnerId) {
        const queued = await manager.findOneByOrFail(PalmMatchQueueEntry, {
          userId,
        });
        return {
          state: PalmMatchClientState.Queued,
          queuedAt: queued.queuedAt.toISOString(),
        };
      }

      const session = await this.createSessionSnapshot(
        manager,
        userId,
        partnerId,
      );
      await manager.delete(PalmMatchQueueEntry, [userId, partnerId]);
      await manager.insert(PalmMatchActiveParticipant, [
        { userId, sessionId: session.id },
        { userId: partnerId, sessionId: session.id },
      ]);
      return this.sessionView(session, userId);
    });
  }

  /** REST recovery state cho reload/reconnect; đồng thời lazy-expire deadline server. */
  async getCurrent(userId: string): Promise<PalmMatchStateView> {
    return this.dataSource.transaction(async (manager) => {
      await this.expireActiveForUser(manager, userId);
      const active = await this.activeState(manager, userId);
      if (active) return active;

      const queued = await manager.findOneBy(PalmMatchQueueEntry, { userId });
      if (!queued) return { state: PalmMatchClientState.Idle };

      const maxWaitSeconds = this.config.getOrThrow(
        'PALM_MATCH_QUEUE_MAX_WAIT_SECONDS',
        { infer: true },
      );
      if (queued.queuedAt.getTime() + maxWaitSeconds * 1000 <= Date.now()) {
        await manager.delete(PalmMatchQueueEntry, { userId });
        return { state: PalmMatchClientState.Idle };
      }
      return {
        state: PalmMatchClientState.Queued,
        queuedAt: queued.queuedAt.toISOString(),
      };
    });
  }

  /** Caller chỉ có thể lật đúng lá suy ra từ JWT; body không nhận participant/card id. */
  async flip(userId: string, sessionId: string): Promise<PalmMatchStateView> {
    return this.dataSource.transaction(async (manager) => {
      const session = await this.lockedActiveSession(
        manager,
        userId,
        sessionId,
      );
      await this.expireSession(manager, session);
      this.assertActive(session);

      if (session.userLowId === userId) {
        session.lowFlippedAt ??= new Date();
      } else {
        session.highFlippedAt ??= new Date();
      }
      await manager.save(session);
      return this.sessionView(session, userId);
    });
  }

  /** Rating một lần; mutual-like tạo Friendship + Conversation cùng transaction session. */
  async rate(
    userId: string,
    sessionId: string,
    rating: PalmMatchRating,
  ): Promise<PalmMatchStateView> {
    return this.dataSource.transaction(async (manager) => {
      const session = await this.lockedActiveSession(
        manager,
        userId,
        sessionId,
      );
      await this.expireSession(manager, session);
      const isLow = session.userLowId === userId;
      const existing = isLow ? session.lowRating : session.highRating;
      if (session.status === PalmMatchSessionStatus.Completed) {
        if (existing === rating) return this.sessionView(session, userId);
        if (existing) {
          throw new DomainException(
            PalmMatchErrors.RATING_CONFLICT,
            'Không thể đổi đánh giá đã chốt',
            HttpStatus.CONFLICT,
          );
        }
        this.assertActive(session);
      }
      if (!session.lowFlippedAt || !session.highFlippedAt) {
        throw new DomainException(
          PalmMatchErrors.RATING_NOT_OPEN,
          'Chỉ được đánh giá sau khi cả hai đã lật bài',
          HttpStatus.CONFLICT,
        );
      }

      if (existing && existing !== rating) {
        throw new DomainException(
          PalmMatchErrors.RATING_CONFLICT,
          'Không thể đổi đánh giá đã chốt',
          HttpStatus.CONFLICT,
        );
      }
      if (!existing) {
        if (isLow) session.lowRating = rating;
        else session.highRating = rating;
      }

      if (rating === PalmMatchRating.Skip) {
        this.completeSession(session, PalmMatchOutcome.NotMatched);
      } else if (
        session.lowRating === PalmMatchRating.Like &&
        session.highRating === PalmMatchRating.Like
      ) {
        await this.friendService.ensureFriendship(
          manager,
          session.userLowId,
          session.userHighId,
          FriendshipSource.PalmMatch,
        );
        this.completeSession(session, PalmMatchOutcome.Matched);
      }

      await manager.save(session);
      return this.sessionView(session, userId);
    });
  }

  /**
   * Huỷ queue hoặc dismiss pointer terminal. Nếu session còn active thì cancel cho cả hai để
   * participant còn lại không chờ vô hạn; caller được giải phóng ngay để enqueue lượt mới.
   */
  async dismissCurrent(userId: string): Promise<PalmMatchStateView> {
    return this.dataSource.transaction(async (manager) => {
      await this.lockMatcher(manager);
      await manager.delete(PalmMatchQueueEntry, { userId });
      const active = await manager.findOneBy(PalmMatchActiveParticipant, {
        userId,
      });
      if (!active) return { state: PalmMatchClientState.Idle };

      const session = await manager.findOne(PalmMatchSession, {
        where: { id: active.sessionId },
        lock: { mode: 'pessimistic_write' },
      });
      if (session?.status === PalmMatchSessionStatus.Active) {
        this.completeSession(session, PalmMatchOutcome.Cancelled);
        await manager.save(session);
      }
      await manager.delete(PalmMatchActiveParticipant, { userId });
      return { state: PalmMatchClientState.Idle };
    });
  }

  // ---------- nội bộ ----------

  private async lockMatcher(manager: EntityManager): Promise<void> {
    await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      PALM_MATCH_ADVISORY_LOCK_KEY,
    ]);
  }

  private async createSessionSnapshot(
    manager: EntityManager,
    userAId: string,
    userBId: string,
  ): Promise<PalmMatchSession> {
    const templates = await manager.find(PalmReadingTemplate, {
      where: { category: PalmMatchCategory.Love, isActive: true },
      order: { id: 'ASC' },
    });
    if (templates.length === 0) {
      throw new DomainException(
        PalmMatchErrors.CATEGORY_EMPTY,
        'Không có nội dung Palm Match đang hoạt động',
        HttpStatus.CONFLICT,
      );
    }

    const id = randomUUID();
    const [userLowId, userHighId] = canonicalPair(userAId, userBId);
    const lowSeed = fnv1aHash(`${id}:${userLowId}:sign`);
    const highSeed = fnv1aHash(`${id}:${userHighId}:sign`);
    const resultSeed = fnv1aHash(`${id}:${userLowId}:${userHighId}:result`);
    const durationSeconds = this.config.getOrThrow(
      'PALM_MATCH_SESSION_DURATION_SECONDS',
      { infer: true },
    );
    const template = templates[resultSeed % templates.length];

    return manager.save(
      manager.create(PalmMatchSession, {
        id,
        userLowId,
        userHighId,
        lowSign: PALM_ZODIAC_SIGNS[lowSeed % PALM_ZODIAC_SIGNS.length].key,
        highSign: PALM_ZODIAC_SIGNS[highSeed % PALM_ZODIAC_SIGNS.length].key,
        compatibilityPercent: 60 + (resultSeed % 40),
        fortune: template.content.split('{name}').join('Người ấy'),
        lowFlippedAt: null,
        highFlippedAt: null,
        lowRating: null,
        highRating: null,
        status: PalmMatchSessionStatus.Active,
        outcome: null,
        expiresAt: new Date(Date.now() + durationSeconds * 1000),
        closedAt: null,
      }),
    );
  }

  private async activeState(
    manager: EntityManager,
    userId: string,
  ): Promise<PalmMatchStateView | null> {
    const active = await manager.findOneBy(PalmMatchActiveParticipant, {
      userId,
    });
    if (!active) return null;
    const session = await manager.findOneBy(PalmMatchSession, {
      id: active.sessionId,
    });
    if (!session) {
      await manager.delete(PalmMatchActiveParticipant, { userId });
      return null;
    }
    return this.sessionView(session, userId);
  }

  private async expireActiveForUser(
    manager: EntityManager,
    userId: string,
  ): Promise<void> {
    const active = await manager.findOneBy(PalmMatchActiveParticipant, {
      userId,
    });
    if (!active) return;
    const session = await manager.findOne(PalmMatchSession, {
      where: { id: active.sessionId },
      lock: { mode: 'pessimistic_write' },
    });
    if (session) await this.expireSession(manager, session);
  }

  private async expireSession(
    manager: EntityManager,
    session: PalmMatchSession,
  ): Promise<void> {
    if (
      session.status === PalmMatchSessionStatus.Active &&
      session.expiresAt.getTime() <= Date.now()
    ) {
      this.completeSession(session, PalmMatchOutcome.Expired);
      await manager.save(session);
    }
  }

  private async lockedActiveSession(
    manager: EntityManager,
    userId: string,
    sessionId: string,
  ): Promise<PalmMatchSession> {
    const active = await manager.findOneBy(PalmMatchActiveParticipant, {
      userId,
      sessionId,
    });
    if (!active) {
      throw new DomainException(
        PalmMatchErrors.SESSION_NOT_FOUND,
        'Không tìm thấy Palm Match session',
        HttpStatus.NOT_FOUND,
      );
    }
    const session = await manager.findOne(PalmMatchSession, {
      where: { id: sessionId },
      lock: { mode: 'pessimistic_write' },
    });
    if (
      !session ||
      (session.userLowId !== userId && session.userHighId !== userId)
    ) {
      throw new DomainException(
        PalmMatchErrors.SESSION_NOT_FOUND,
        'Không tìm thấy Palm Match session',
        HttpStatus.NOT_FOUND,
      );
    }
    return session;
  }

  private assertActive(session: PalmMatchSession): void {
    if (session.status !== PalmMatchSessionStatus.Active) {
      throw new DomainException(
        PalmMatchErrors.SESSION_FINISHED,
        'Palm Match session đã kết thúc',
        HttpStatus.CONFLICT,
      );
    }
  }

  private completeSession(
    session: PalmMatchSession,
    outcome: PalmMatchOutcome,
  ): void {
    session.status = PalmMatchSessionStatus.Completed;
    session.outcome = outcome;
    session.closedAt = new Date();
  }

  private sessionView(
    session: PalmMatchSession,
    userId: string,
  ): PalmMatchStateView {
    const isLow = session.userLowId === userId;
    const partnerUserId = isLow ? session.userHighId : session.userLowId;
    const myFlippedAt = isLow ? session.lowFlippedAt : session.highFlippedAt;
    const opponentFlippedAt = isLow
      ? session.highFlippedAt
      : session.lowFlippedAt;
    const bothFlipped = Boolean(myFlippedAt && opponentFlippedAt);
    const mySignKey = isLow ? session.lowSign : session.highSign;
    const opponentSignKey = isLow ? session.highSign : session.lowSign;
    const myRating = isLow ? session.lowRating : session.highRating;

    return {
      state:
        session.status === PalmMatchSessionStatus.Completed
          ? PalmMatchClientState.Completed
          : PalmMatchClientState.Active,
      sessionId: session.id,
      expiresAt: session.expiresAt.toISOString(),
      myFlipped: Boolean(myFlippedAt),
      opponentFlipped: Boolean(opponentFlippedAt),
      ...(myFlippedAt ? { mySign: this.signByKey(mySignKey) } : {}),
      ...(opponentFlippedAt
        ? { opponentSign: this.signByKey(opponentSignKey) }
        : {}),
      ...(bothFlipped
        ? {
            compatibilityPercent: session.compatibilityPercent,
            fortune: session.fortune,
          }
        : {}),
      ...(myRating ? { myRating } : {}),
      ...(session.outcome ? { outcome: session.outcome } : {}),
      ...(session.outcome === PalmMatchOutcome.Matched
        ? { partnerUserId }
        : {}),
    };
  }

  private signByKey(key: string): PalmZodiacSign {
    const sign = PALM_ZODIAC_SIGNS.find((entry) => entry.key === key);
    if (!sign)
      throw new Error(`Palm Match session có sign không hợp lệ: ${key}`);
    return sign;
  }

  private assertAndTrimTargetName(targetName?: string): string | undefined {
    const trimmed = targetName?.trim();
    if (!trimmed) return undefined;

    const maxLength = this.config.getOrThrow(
      'PALM_MATCH_TARGET_NAME_MAX_LENGTH',
      { infer: true },
    );
    if (trimmed.length > maxLength) {
      throw new DomainException(
        PalmMatchErrors.TARGET_NAME_TOO_LONG,
        `targetName dài quá ${maxLength} ký tự`,
        HttpStatus.UNPROCESSABLE_ENTITY,
        { maxLength },
      );
    }
    return trimmed;
  }

  /** Không truyền targetName → giữ nguyên content, câu phải tự nhiên (seed data đảm bảo). */
  private applyTargetName(content: string, targetName?: string): string {
    if (!targetName) return content;
    return content.split('{name}').join(targetName);
  }
}
