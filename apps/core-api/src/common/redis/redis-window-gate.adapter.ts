import type Redis from 'ioredis';

import { closeCoreRedisClient } from './core-redis-client';
import type { WindowGatePort } from './window-gate.port';

/**
 * `SET key 1 EX window NX`: một lệnh nguyên tử, tự hết hạn nên không cần dọn. Lỗi Redis được ném ra
 * để caller chọn fail-open/fail-closed (client dùng chung đã tắt offline queue nên lỗi đến nhanh).
 */
export class RedisWindowGateAdapter implements WindowGatePort {
  constructor(private readonly redis: Redis) {}

  async tryAcquire(key: string, windowSeconds: number): Promise<boolean> {
    if (!key) throw new Error('Window gate key is required');
    if (!Number.isInteger(windowSeconds) || windowSeconds < 1) {
      throw new Error('Window gate windowSeconds must be a positive integer');
    }
    return (await this.redis.set(key, '1', 'EX', windowSeconds, 'NX')) === 'OK';
  }

  async release(key: string): Promise<void> {
    await this.redis.del(key);
  }

  /** Releases this adapter's shared command-client reference for provider lifecycle wiring. */
  async close(): Promise<void> {
    await closeCoreRedisClient(this.redis);
  }
}
