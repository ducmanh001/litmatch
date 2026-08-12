import type Redis from 'ioredis';

import { closeCoreRedisClient } from '../redis/core-redis-client';
import type { RealtimePublisherPort } from './realtime-publisher.port';

/** Redis pub/sub adapter; it deliberately has no delivery guarantee. */
export class RedisRealtimePublisher implements RealtimePublisherPort {
  constructor(private readonly redis: Redis) {}

  publish(channel: string, payload: string): Promise<number> {
    return this.redis.publish(channel, payload);
  }

  /** Releases this adapter's shared command-client reference for provider lifecycle wiring. */
  async close(): Promise<void> {
    await closeCoreRedisClient(this.redis);
  }
}
