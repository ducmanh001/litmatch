import { createHmac } from 'node:crypto';

import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DomainException } from '@litmatch/common-exceptions';

import { GuestDeviceTokenService } from '../../auth';
import { User } from '../../user';
import { EconomyService, VipTier } from '../../economy';
import { GuestMatchQuota } from '../entities/guest-match-quota.entity';
import { MatchDailyQuota } from '../entities/match-daily-quota.entity';
import { MatchType } from '../entities/match-ticket.entity';
import { MatchingErrors } from '../matching.errors';

import type { CoreApiEnv } from '../../../config/env.validation';
import type { EntityManager } from 'typeorm';

export interface GuestQuotaRequestContext {
  deviceToken?: string;
  ip: string;
}

export interface GuestQuotaAuthorization {
  user: User;
  quotaDate: string;
  keyHashes: string[];
}

export interface MatchQuotaDecision {
  quotaDate: string;
  freeLimit: number;
  tier: VipTier | null;
  paidDiamond: boolean;
}

@Injectable()
export class GuestMatchQuotaService {
  constructor(
    private readonly deviceTokens: GuestDeviceTokenService,
    private readonly config: ConfigService<CoreApiEnv, true>,
    private readonly economy: EconomyService,
  ) {}

  /**
   * Lock user để upgrade và join có một thứ tự rõ ràng. `isGuest` từ JWT không tham gia
   * quyết định; stale JWT sau upgrade vì vậy không giữ quota guest.
   */
  async authorize(
    manager: EntityManager,
    userId: string,
    context: GuestQuotaRequestContext,
  ): Promise<GuestQuotaAuthorization> {
    const user = await manager.findOneOrFail(User, {
      where: { id: userId },
      lock: { mode: 'pessimistic_write' },
    });
    const quotaDate = new Date().toISOString().slice(0, 10);
    if (!user.isGuest) return { user, quotaDate, keyHashes: [] };

    if (!context.deviceToken) {
      throw new DomainException(
        MatchingErrors.GUEST_DEVICE_TOKEN_REQUIRED,
        'Guest phải gửi X-Guest-Device-Token được cấp lúc đăng nhập',
        HttpStatus.UNAUTHORIZED,
      );
    }
    const deviceKey = await this.deviceTokens.verifyForUser(
      context.deviceToken,
      userId,
    );
    const keyHashes = [
      this.keyHash('user', userId),
      this.keyHash('device', deviceKey),
      this.keyHash('network', this.normalizeNetwork(context.ip)),
    ];
    return {
      user,
      quotaDate,
      keyHashes: keyHashes.sort(),
    };
  }

  /** Insert-before-lock + thứ tự key ổn định tránh lost update/deadlock khi nhiều key giao nhau. */
  async consume(
    manager: EntityManager,
    authorization: GuestQuotaAuthorization,
  ): Promise<void> {
    if (authorization.keyHashes.length === 0) return;
    const { quotaDate, keyHashes } = authorization;
    await manager
      .createQueryBuilder()
      .insert()
      .into(GuestMatchQuota)
      .values(keyHashes.map((keyHash) => ({ quotaDate, keyHash, count: 0 })))
      .orIgnore()
      .execute();

    const rows = await manager
      .createQueryBuilder(GuestMatchQuota, 'q')
      .setLock('pessimistic_write')
      .where('q.quotaDate = :quotaDate', { quotaDate })
      .andWhere('q.keyHash IN (:...keyHashes)', { keyHashes })
      .orderBy('q.keyHash', 'ASC')
      .getMany();
    const limit = this.config.getOrThrow('MATCHING_GUEST_DAILY_LIMIT', {
      infer: true,
    });
    if (
      rows.length !== keyHashes.length ||
      rows.some((row) => row.count >= limit)
    ) {
      throw new DomainException(
        MatchingErrors.GUEST_DAILY_QUOTA_EXCEEDED,
        `Guest đã hết ${limit} lượt match miễn phí trong ngày UTC`,
        HttpStatus.TOO_MANY_REQUESTS,
        { limit, quotaDate },
      );
    }
    await manager
      .createQueryBuilder()
      .update(GuestMatchQuota)
      .set({ count: () => 'count + 1', updatedAt: () => 'CURRENT_TIMESTAMP' })
      .where('quota_date = :quotaDate', { quotaDate })
      .andWhere('key_hash IN (:...keyHashes)', { keyHashes })
      .execute();
  }

  /**
   * Consumes one free slot atomically, or returns a paid decision for Matching
   * to debit Diamond in the same transaction as the ticket insert.
   */
  async consumeForMatch(
    manager: EntityManager,
    authorization: GuestQuotaAuthorization,
    matchType: MatchType,
    useDiamond: boolean,
  ): Promise<MatchQuotaDecision> {
    const guestLimit = this.config.getOrThrow('MATCHING_GUEST_DAILY_LIMIT', {
      infer: true,
    });
    if (useDiamond)
      return {
        quotaDate: authorization.quotaDate,
        freeLimit: guestLimit,
        tier: null,
        paidDiamond: true,
      };

    if (authorization.keyHashes.length > 0) {
      await this.consume(manager, authorization);
      return {
        quotaDate: authorization.quotaDate,
        freeLimit: guestLimit,
        tier: null,
        paidDiamond: false,
      };
    }

    const tier = await this.economy.getActiveVipTier(
      authorization.user.id,
      manager,
    );
    const freeLimit = this.dailyLimit(tier, matchType);
    const quotaDate = authorization.quotaDate;
    await manager
      .createQueryBuilder()
      .insert()
      .into(MatchDailyQuota)
      .values({
        userId: authorization.user.id,
        quotaDate,
        matchType,
        count: 0,
      })
      .orIgnore()
      .execute();
    const row = await manager
      .getRepository(MatchDailyQuota)
      .createQueryBuilder('q')
      .setLock('pessimistic_write')
      .where('q.user_id = :userId', { userId: authorization.user.id })
      .andWhere('q.quota_date = :quotaDate', { quotaDate })
      .andWhere('q.match_type = :matchType', { matchType })
      .getOneOrFail();
    if (row.count >= freeLimit) {
      throw new DomainException(
        MatchingErrors.DAILY_QUOTA_EXCEEDED,
        `Đã hết ${freeLimit} lượt ${matchType} miễn phí trong ngày UTC`,
        HttpStatus.TOO_MANY_REQUESTS,
        { limit: freeLimit, quotaDate, matchType },
      );
    }
    await manager
      .createQueryBuilder()
      .update(MatchDailyQuota)
      .set({ count: () => 'count + 1', updatedAt: () => 'CURRENT_TIMESTAMP' })
      .where('user_id = :userId', { userId: authorization.user.id })
      .andWhere('quota_date = :quotaDate', { quotaDate })
      .andWhere('match_type = :matchType', { matchType })
      .execute();
    return { quotaDate, freeLimit, tier, paidDiamond: false };
  }

  private dailyLimit(tier: VipTier | null, matchType: MatchType): number {
    if (tier === VipTier.Svip) {
      return matchType === MatchType.Soul
        ? this.config.getOrThrow('MATCHING_SVIP_DAILY_SOUL_LIMIT', {
            infer: true,
          })
        : this.config.getOrThrow('MATCHING_SVIP_DAILY_VOICE_LIMIT', {
            infer: true,
          });
    }
    if (tier === VipTier.Vip) {
      return matchType === MatchType.Soul
        ? this.config.getOrThrow('MATCHING_VIP_DAILY_SOUL_LIMIT', {
            infer: true,
          })
        : this.config.getOrThrow('MATCHING_VIP_DAILY_VOICE_LIMIT', {
            infer: true,
          });
    }
    return matchType === MatchType.Soul
      ? this.config.getOrThrow('MATCHING_DAILY_SOUL_LIMIT', { infer: true })
      : this.config.getOrThrow('MATCHING_DAILY_VOICE_LIMIT', { infer: true });
  }

  private keyHash(kind: string, value: string): string {
    return createHmac(
      'sha256',
      this.config.getOrThrow('MATCHING_GUEST_QUOTA_PEPPER', { infer: true }),
    )
      .update(`${kind}:${value}`)
      .digest('hex');
  }

  private normalizeNetwork(value: string): string {
    const normalized = value.trim().toLowerCase();
    return normalized.startsWith('::ffff:') ? normalized.slice(7) : normalized;
  }
}
