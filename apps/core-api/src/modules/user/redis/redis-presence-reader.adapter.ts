import { realtimePresenceKey } from '@litmatch/common-dtos';

import { closeCoreRedisClient } from '../../../common/redis/core-redis-client';

import type Redis from 'ioredis';
import type { UserPresenceReaderPort } from '../ports/user-presence-reader.port';

export class RedisPresenceReader implements UserPresenceReaderPort {
  constructor(private readonly redis: Redis) {}

  /** Fail closed: Redis outage must never turn into a false online signal. */
  async isOnline(userId: string): Promise<boolean> {
    try {
      const key = realtimePresenceKey(userId);
      await this.redis.zremrangebyscore(key, '-inf', Date.now());
      return (await this.redis.zcard(key)) > 0;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    await closeCoreRedisClient(this.redis);
  }
}
