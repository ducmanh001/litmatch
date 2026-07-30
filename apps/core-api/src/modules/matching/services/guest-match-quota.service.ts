import { createHmac } from 'node:crypto';

import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DomainException } from '@litmatch/common-exceptions';

import { GuestDeviceTokenService } from '../../auth';
import { User } from '../../user';
import { GuestMatchQuota } from '../entities/guest-match-quota.entity';
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

@Injectable()
export class GuestMatchQuotaService {
  constructor(
    private readonly deviceTokens: GuestDeviceTokenService,
    private readonly config: ConfigService<CoreApiEnv, true>,
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
