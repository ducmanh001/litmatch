import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

import type { Provider } from '@nestjs/common';
import type { CoreApiEnv } from '../../../config/env.validation';
import type { MatchTicket } from '../entities/match-ticket.entity';

/** Client ioredis riêng của module Matching (không dùng chung connection với module khác). */
export const MATCHING_REDIS = Symbol('MATCHING_REDIS');

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

/** Score sorted set: nhỏ hơn = được ghép trước; speed-up trừ boost khỏi score (spec § 2). */
export function ticketScore(
  ticket: Pick<MatchTicket, 'enqueuedAt' | 'priorityBoostMs'>,
): number {
  return ticket.enqueuedAt.getTime() - ticket.priorityBoostMs;
}

export const matchingRedisProvider: Provider = {
  provide: MATCHING_REDIS,
  inject: [ConfigService],
  useFactory: (config: ConfigService<CoreApiEnv, true>): Redis =>
    new Redis(config.getOrThrow('REDIS_URL', { infer: true })),
};
