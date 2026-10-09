import { Logger } from '@nestjs/common';
import { ThrottlerStorageService } from '@nestjs/throttler';

import { closeCoreRedisClient } from '../redis/core-redis-client';

import type { OnApplicationShutdown } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import type Redis from 'ioredis';

// `ThrottlerStorageRecord` không được package export; suy ra từ chữ ký của interface.
type ThrottlerStorageRecord = Awaited<
  ReturnType<ThrottlerStorage['increment']>
>;

/** Skip Redis for this long after a failure so a slow/down Redis cannot add latency to every request. */
const REDIS_RETRY_AFTER_MS = 5_000;
const WARN_INTERVAL_MS = 30_000;

/**
 * Fixed-window counter plus a block key, in one atomic call. Both keys share a hash tag so they
 * stay in one slot on a clustered Redis.
 *
 * KEYS[1] hits, KEYS[2] block; ARGV[1] window ms, ARGV[2] limit, ARGV[3] block ms.
 * Returns { totalHits, windowTtlMs, isBlocked (0/1), blockTtlMs }.
 *
 * Exceeding the limit sets the block key and shortens the hits key to the block duration, so the
 * counter restarts exactly when the block ends (same contract as the in-memory storage).
 */
const THROTTLE_INCREMENT_LUA = `
local blockTtl = redis.call('PTTL', KEYS[2])
if blockTtl > 0 then
  local hits = tonumber(redis.call('GET', KEYS[1]) or '0')
  return { hits, math.max(redis.call('PTTL', KEYS[1]), 0), 1, blockTtl }
end

local hits = redis.call('INCR', KEYS[1])
local ttl = redis.call('PTTL', KEYS[1])
if hits == 1 or ttl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
if hits > tonumber(ARGV[2]) then
  redis.call('SET', KEYS[2], '1', 'PX', ARGV[3])
  redis.call('PEXPIRE', KEYS[1], ARGV[3])
  return { hits, tonumber(ARGV[3]), 1, tonumber(ARGV[3]) }
end
return { hits, ttl, 0, 0 }
`;

type ThrottleEvalResult = [number, number, number, number];

/**
 * `@nestjs/throttler` storage shared by every core-api pod. The default in-memory storage counts
 * per process, so with N replicas the effective limit is N times higher and it resets on every
 * deploy. Redis failures never fail the request: the pod falls back to its own in-memory counters
 * (per-pod limits are still better than none) and retries Redis after a short pause.
 */
export class RedisThrottlerStorage
  implements ThrottlerStorage, OnApplicationShutdown
{
  private readonly logger = new Logger(RedisThrottlerStorage.name);
  private readonly fallback = new ThrottlerStorageService();
  private redisRetryAt = 0;
  private lastWarnAt = 0;

  constructor(
    private readonly redis: Redis,
    private readonly now: () => number = Date.now,
  ) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    if (this.now() < this.redisRetryAt) {
      return this.fallback.increment(
        key,
        ttl,
        limit,
        blockDuration,
        throttlerName,
      );
    }

    try {
      const slot = `throttle:{${throttlerName}:${key}}`;
      const [totalHits, windowTtlMs, blocked, blockTtlMs] =
        (await this.redis.eval(
          THROTTLE_INCREMENT_LUA,
          2,
          `${slot}:hits`,
          `${slot}:block`,
          String(ttl),
          String(limit),
          String(blockDuration),
        )) as ThrottleEvalResult;
      return {
        totalHits,
        timeToExpire: Math.ceil(windowTtlMs / 1000),
        isBlocked: blocked === 1,
        timeToBlockExpire: Math.ceil(blockTtlMs / 1000),
      };
    } catch (error) {
      this.redisRetryAt = this.now() + REDIS_RETRY_AFTER_MS;
      this.warnRedisUnavailable(error);
      return this.fallback.increment(
        key,
        ttl,
        limit,
        blockDuration,
        throttlerName,
      );
    }
  }

  async onApplicationShutdown(): Promise<void> {
    this.fallback.onApplicationShutdown();
    await closeCoreRedisClient(this.redis);
  }

  private warnRedisUnavailable(error: unknown): void {
    const now = this.now();
    if (now - this.lastWarnAt < WARN_INTERVAL_MS) return;
    this.lastWarnAt = now;
    this.logger.warn(
      `Redis throttler storage lỗi, dùng bộ đếm trong bộ nhớ của pod này tạm thời: ${String(error)}`,
    );
  }
}
