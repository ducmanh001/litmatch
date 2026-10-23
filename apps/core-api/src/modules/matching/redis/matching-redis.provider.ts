import { ConfigService } from '@nestjs/config';
import { parseRealtimeRedisUrls } from '@litmatch/common-dtos';
import { createCoreRedisClient } from '../../../common/redis/core-redis-client';
import { RedisRateLimitAdapter } from '../../../common/redis/redis-rate-limit.adapter';
import { createRealtimePublisher } from '../../../common/realtime/realtime-publisher.factory';
import { RedisMatchingQueue } from './redis-matching-queue.adapter';
import { ShardedMatchingQueue } from './sharded-matching-queue.adapter';

import type { Provider } from '@nestjs/common';
import type { CoreApiEnv } from '../../../config/env.validation';
import type { MatchTicket } from '../entities/match-ticket.entity';
import type { MatchingQueuePort } from '../ports/matching-queue.port';
import type { RateLimitPort } from '../../../common/redis/rate-limit.port';
import type { RealtimePublisherPort } from '../../../common/realtime/realtime-publisher.port';

/** Capability token for the derived sorted-set queue; not a general Redis client. */
export const MATCHING_QUEUE = Symbol('MATCHING_QUEUE');
export const MATCHING_RATE_LIMIT = Symbol('MATCHING_RATE_LIMIT');
export const MATCHING_REALTIME = Symbol('MATCHING_REALTIME');

const MATCHING_REDIS_CLIENT = Symbol('MATCHING_REDIS_CLIENT');

/** Set các shard đang có ticket chờ — matcher chỉ quét set này, không quét keyspace (spec § 2). */
export const MATCHING_ACTIVE_SHARDS_KEY = 'matching:shards:active';

/** Shard key theo (matchType, region, ageBand) — docs/03 § 3.8.B. */
export function matchingShardKey(
  matchType: string,
  region: string,
  ageBand: number,
): string {
  return `matching:queue:${matchType}:${region}:${ageBand}`;
}

export function shardKeyOfTicket(
  ticket: Pick<MatchTicket, 'matchType' | 'region' | 'ageBand'>,
): string {
  return matchingShardKey(ticket.matchType, ticket.region, ticket.ageBand);
}

/**
 * Score sorted set: nhỏ hơn = được ghép trước; speed-up trừ boost khỏi score (spec § 2).
 * `trustPenaltyMs` cộng thêm (docs/services/safety-service.md § 3.2) — snapshot 1 lần lúc
 * enqueue, không đổi cách boost/lock hoạt động.
 */
export function ticketScore(
  ticket: Pick<
    MatchTicket,
    'enqueuedAt' | 'priorityBoostMs' | 'trustPenaltyMs'
  >,
): number {
  return (
    ticket.enqueuedAt.getTime() + ticket.trustPenaltyMs - ticket.priorityBoostMs
  );
}

export const matchingRedisClientProvider: Provider = {
  provide: MATCHING_REDIS_CLIENT,
  inject: [ConfigService],
  useFactory: (config: ConfigService<CoreApiEnv, true>) =>
    createCoreRedisClient(config.getOrThrow('REDIS_URL', { infer: true })),
};

export const matchingQueueProvider: Provider = {
  provide: MATCHING_QUEUE,
  inject: [ConfigService],
  useFactory: (config: ConfigService<CoreApiEnv, true>): MatchingQueuePort => {
    const urls = parseRealtimeRedisUrls(
      config.getOrThrow('MATCHING_REDIS_URLS', { infer: true }),
      config.getOrThrow('REDIS_URL', { infer: true }),
    );
    const shards = urls.map(
      (url) =>
        new RedisMatchingQueue(
          createCoreRedisClient(url),
          MATCHING_ACTIVE_SHARDS_KEY,
        ),
    );
    return shards.length === 1 ? shards[0] : new ShardedMatchingQueue(shards);
  },
};

export const matchingRateLimitProvider: Provider = {
  provide: MATCHING_RATE_LIMIT,
  inject: [MATCHING_REDIS_CLIENT],
  useFactory: (redis: import('ioredis').default): RateLimitPort =>
    new RedisRateLimitAdapter(redis),
};

export const matchingRealtimeProvider: Provider = {
  provide: MATCHING_REALTIME,
  inject: [ConfigService],
  useFactory: (
    config: ConfigService<CoreApiEnv, true>,
  ): RealtimePublisherPort => createRealtimePublisher(config),
};
