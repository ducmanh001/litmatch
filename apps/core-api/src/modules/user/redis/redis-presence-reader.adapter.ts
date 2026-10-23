import { realtimePresenceKey, realtimeShardIndex } from '@litmatch/common-dtos';

import { closeCoreRedisClient } from '../../../common/redis/core-redis-client';

import type Redis from 'ioredis';
import type { UserPresenceReaderPort } from '../ports/user-presence-reader.port';

/**
 * Đọc presence do signaling-gateway ghi. Lease của một user nằm ở shard Redis của chính user đó
 * (`REALTIME_REDIS_URLS`, cùng `realtimeShardIndex` với gateway) nên mỗi lần đọc chỉ chạm một shard.
 */
export class RedisPresenceReader implements UserPresenceReaderPort {
  private readonly shards: readonly Redis[];

  constructor(shards: Redis | readonly Redis[]) {
    this.shards = Array.isArray(shards) ? shards : [shards as Redis];
  }

  /** Fail closed: Redis outage must never turn into a false online signal. */
  async isOnline(userId: string): Promise<boolean> {
    try {
      const redis = this.shards[realtimeShardIndex(userId, this.shards.length)];
      const key = realtimePresenceKey(userId);
      await redis.zremrangebyscore(key, '-inf', Date.now());
      return (await redis.zcard(key)) > 0;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    await Promise.all(this.shards.map((redis) => closeCoreRedisClient(redis)));
  }
}
