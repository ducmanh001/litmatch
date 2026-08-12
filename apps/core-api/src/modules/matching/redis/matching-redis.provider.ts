import { ConfigService } from '@nestjs/config';
import { createCoreRedisClient } from '../../../common/redis/core-redis-client';
import { RedisRateLimitAdapter } from '../../../common/redis/redis-rate-limit.adapter';
import { RedisRealtimePublisher } from '../../../common/realtime/redis-realtime-publisher.adapter';
import { RedisMatchingQueue } from './redis-matching-queue.adapter';

import type { Provider } from '@nestjs/common';
import type { CoreApiEnv } from '../../../config/env.validation';
import type { MatchTicket } from '../entities/match-ticket.entity';
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

/** Counter rate-limit speed-up theo user (spec § 4) — không đếm bằng cột trên ticket. */
export function speedupCountKey(userId: string): string {
  return `matching:speedup:count:${userId}`;
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
  inject: [MATCHING_REDIS_CLIENT],
  useFactory: (redis: import('ioredis').default) =>
    new RedisMatchingQueue(redis, MATCHING_ACTIVE_SHARDS_KEY),
};

export const matchingRateLimitProvider: Provider = {
  provide: MATCHING_RATE_LIMIT,
  inject: [MATCHING_REDIS_CLIENT],
  useFactory: (redis: import('ioredis').default): RateLimitPort =>
    new RedisRateLimitAdapter(redis),
};

export const matchingRealtimeProvider: Provider = {
  provide: MATCHING_REALTIME,
  inject: [MATCHING_REDIS_CLIENT],
  useFactory: (redis: import('ioredis').default): RealtimePublisherPort =>
    new RedisRealtimePublisher(redis),
};
