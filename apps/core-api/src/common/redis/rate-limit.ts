import type Redis from 'ioredis';

import { RedisRateLimitAdapter } from './redis-rate-limit.adapter';

/** true = còn trong hạn mức (đã tính lượt này), false = vượt giới hạn (lượt này KHÔNG tính). */
export async function checkRateLimit(
  redis: Redis,
  key: string,
  max: number,
  windowSeconds: number,
): Promise<boolean> {
  const result = await new RedisRateLimitAdapter(redis).consume({
    key,
    limit: max,
    windowSeconds,
  });
  return result.allowed;
}

export type {
  RateLimitConsumeRequest,
  RateLimitConsumeResult,
  RateLimitPort,
  RateLimitReservation,
} from './rate-limit.port';
export { RedisRateLimitAdapter } from './redis-rate-limit.adapter';
