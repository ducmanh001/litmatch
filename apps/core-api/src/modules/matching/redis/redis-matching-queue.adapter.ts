import { closeCoreRedisClient } from '../../../common/redis/core-redis-client';

import type Redis from 'ioredis';
import type { MatchingQueuePort } from '../ports/matching-queue.port';

export class RedisMatchingQueue implements MatchingQueuePort {
  constructor(
    private readonly redis: Redis,
    private readonly activeShardsKey: string,
  ) {}

  async enqueue(
    shard: string,
    score: string,
    ticketId: string,
    mode: 'NX' | 'XX',
  ): Promise<void> {
    await this.redis.zadd(shard, mode, score, ticketId);
  }

  async remove(shard: string, ticketId: string): Promise<void> {
    await this.redis.zrem(shard, ticketId);
  }

  async popMin(shard: string, count: number): Promise<Array<[string, string]>> {
    const values = await this.redis.zpopmin(shard, count);
    const entries: Array<[string, string]> = [];
    for (let index = 0; index + 1 < values.length; index += 2) {
      entries.push([values[index], values[index + 1]]);
    }
    return entries;
  }

  async listActiveShards(): Promise<string[]> {
    return this.redis.smembers(this.activeShardsKey);
  }

  async markActive(shard: string): Promise<void> {
    await this.redis.sadd(this.activeShardsKey, shard);
  }

  async unmarkActive(shard: string): Promise<void> {
    await this.redis.srem(this.activeShardsKey, shard);
  }

  async hasEntries(shard: string): Promise<boolean> {
    return (await this.redis.zcard(shard)) > 0;
  }

  async close(): Promise<void> {
    await closeCoreRedisClient(this.redis);
  }
}
