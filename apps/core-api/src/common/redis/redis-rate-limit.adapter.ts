import { randomUUID } from 'node:crypto';

import type Redis from 'ioredis';

import { closeCoreRedisClient } from './core-redis-client';
import type {
  RateLimitConsumeRequest,
  RateLimitConsumeResult,
  RateLimitPort,
  RateLimitReservation,
} from './rate-limit.port';

const RATE_LIMIT_RESERVATION_SUFFIX = ':rate-limit-reservation:';
const RATE_LIMIT_WINDOW_SUFFIX = ':rate-limit-window';

/**
 * Atomically consumes exactly one quota slot. A rejected request is immediately decremented and
 * receives no reservation. The reservation records the Redis window identity so a late refund
 * cannot decrement a later window that happens to reuse the same rate-limit key.
 */
const RATE_LIMIT_CONSUME_LUA = `
if redis.call('EXISTS', KEYS[2]) == 1 then
  return { 2, redis.call('GET', KEYS[2]) }
end

local c = redis.call('INCR', KEYS[1])
if c == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[2])
  redis.call('SET', KEYS[3], ARGV[3], 'EX', ARGV[2])
end
if c > tonumber(ARGV[1]) then
  redis.call('DECR', KEYS[1])
  return { 0, '' }
end

local ttl = redis.call('TTL', KEYS[1])
local window = redis.call('GET', KEYS[3])
if not window then
  window = ARGV[3]
  redis.call('SET', KEYS[3], window, 'EX', math.max(ttl, 1))
end
redis.call('SET', KEYS[2], window, 'EX', math.max(ttl, 1))
return { 1, window }
`;

/** A reservation can be refunded once; Redis deletes its marker before updating the counter. */
const RATE_LIMIT_REFUND_LUA = `
local reservationWindow = redis.call('GET', KEYS[2])
if not reservationWindow then return 0 end

redis.call('DEL', KEYS[2])
if redis.call('GET', KEYS[3]) ~= reservationWindow then return 0 end

local c = tonumber(redis.call('GET', KEYS[1]) or '0')
if c <= 0 then return 0 end

local updated = redis.call('DECR', KEYS[1])
if updated <= 0 then
  redis.call('DEL', KEYS[1])
  redis.call('DEL', KEYS[3])
end
return 1
`;

type RedisEvalResult = number | string | [number | string, string | null];

export class RedisRateLimitAdapter implements RateLimitPort {
  constructor(private readonly redis: Redis) {}

  async consume(
    request: RateLimitConsumeRequest,
  ): Promise<RateLimitConsumeResult> {
    validateConsumeRequest(request);

    const reservationKey = `${request.key}${RATE_LIMIT_RESERVATION_SUFFIX}${
      request.operationId ?? randomUUID()
    }`;
    const windowKey = `${request.key}${RATE_LIMIT_WINDOW_SUFFIX}`;
    const result = (await this.redis.eval(
      RATE_LIMIT_CONSUME_LUA,
      3,
      request.key,
      reservationKey,
      windowKey,
      String(request.limit),
      String(request.windowSeconds),
      randomUUID(),
    )) as RedisEvalResult;
    const [status] = Array.isArray(result) ? result : [result];

    if (Number(status) <= 0) {
      return { allowed: false, deduplicated: false };
    }

    return {
      allowed: true,
      deduplicated: Number(status) === 2,
      reservation: { rateLimitKey: request.key, reservationKey, windowKey },
    };
  }

  async refund(reservation: RateLimitReservation): Promise<boolean> {
    const result = await this.redis.eval(
      RATE_LIMIT_REFUND_LUA,
      3,
      reservation.rateLimitKey,
      reservation.reservationKey,
      reservation.windowKey,
    );
    return Number(result) === 1;
  }

  /** Releases this adapter's shared command-client reference for provider lifecycle wiring. */
  async close(): Promise<void> {
    await closeCoreRedisClient(this.redis);
  }
}

function validateConsumeRequest(request: RateLimitConsumeRequest): void {
  if (!request.key) throw new Error('Rate-limit key is required');
  if (!Number.isSafeInteger(request.limit) || request.limit < 1) {
    throw new Error('Rate-limit limit must be a positive integer');
  }
  if (
    !Number.isSafeInteger(request.windowSeconds) ||
    request.windowSeconds < 1
  ) {
    throw new Error('Rate-limit windowSeconds must be a positive integer');
  }
}
