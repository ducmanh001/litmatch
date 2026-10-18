import { closeCoreRedisClient } from '../../../common/redis/core-redis-client';

import type Redis from 'ioredis';
import type { MatchingQueuePort } from '../ports/matching-queue.port';

/**
 * Lấy cả hai hoặc không lấy gì: ZSCORE cả hai trước khi ZREM. Một Lua script chạy trọn vẹn trên
 * Redis đơn luồng nên hai matcher cùng chọn một ticket thì đúng một bên thắng, bên kia nhận 0
 * và không phải "trả lại" ticket nào (khác ZPOPMIN, vốn lấy ra rồi mới biết có ghép được không).
 */
const CLAIM_PAIR_SCRIPT = `
local a = redis.call('ZSCORE', KEYS[1], ARGV[1])
local b = redis.call('ZSCORE', KEYS[1], ARGV[2])
if a and b then
  redis.call('ZREM', KEYS[1], ARGV[1], ARGV[2])
  return 1
end
return 0
`;

type ClaimPairRedis = Redis & {
  matchingClaimPair(
    shard: string,
    ticketA: string,
    ticketB: string,
  ): Promise<number>;
};

export class RedisMatchingQueue implements MatchingQueuePort {
  private readonly claimRedis: ClaimPairRedis;

  constructor(
    private readonly redis: Redis,
    private readonly activeShardsKey: string,
  ) {
    // Client dùng chung theo URL trong process: định nghĩa lại cùng một lệnh là idempotent.
    redis.defineCommand('matchingClaimPair', {
      numberOfKeys: 1,
      lua: CLAIM_PAIR_SCRIPT,
    });
    this.claimRedis = redis as ClaimPairRedis;
  }

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

  async peekWindow(
    shard: string,
    max: number,
  ): Promise<Array<[string, string]>> {
    const values = await this.redis.zrange(shard, 0, max - 1, 'WITHSCORES');
    const entries: Array<[string, string]> = [];
    for (let index = 0; index + 1 < values.length; index += 2) {
      entries.push([values[index], values[index + 1]]);
    }
    return entries;
  }

  async claimPair(
    shard: string,
    ticketA: string,
    ticketB: string,
  ): Promise<boolean> {
    return (
      (await this.claimRedis.matchingClaimPair(shard, ticketA, ticketB)) === 1
    );
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
