import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

import { MATCHING_REDIS } from './matching-redis.provider';
import { MatchTicket, MatchTicketStatus, MatchType } from '../entities/match-ticket.entity';

const CLAIM_BATCH_SCRIPT = `
local expired = redis.call('ZRANGEBYSCORE', KEYS[2], '-inf', ARGV[4], 'LIMIT', 0, 1000)
for _, id in ipairs(expired) do
  local score = redis.call('HGET', KEYS[4], id)
  if score then redis.call('ZADD', KEYS[1], score, id) end
  redis.call('ZREM', KEYS[2], id)
  redis.call('HDEL', KEYS[3], id)
  redis.call('HDEL', KEYS[4], id)
end

local raw = redis.call('ZRANGE', KEYS[1], 0, tonumber(ARGV[1]) - 1, 'WITHSCORES')
for i = 1, #raw, 2 do
  local id = raw[i]
  local score = raw[i + 1]
  redis.call('ZREM', KEYS[1], id)
  redis.call('ZADD', KEYS[2], ARGV[2], id)
  redis.call('HSET', KEYS[3], id, ARGV[3])
  redis.call('HSET', KEYS[4], id, score)
end
return raw
`;

const RELEASE_SCRIPT = `
for i = 1, #ARGV, 2 do
  local id = ARGV[i]
  local owner = ARGV[i + 1]
  if redis.call('HGET', KEYS[3], id) == owner then
    local score = redis.call('HGET', KEYS[4], id)
    if score then redis.call('ZADD', KEYS[1], score, id) end
    redis.call('ZREM', KEYS[2], id)
    redis.call('HDEL', KEYS[3], id)
    redis.call('HDEL', KEYS[4], id)
  end
end
return 1
`;

const ACK_SCRIPT = `
for i = 1, #ARGV, 2 do
  local id = ARGV[i]
  local owner = ARGV[i + 1]
  if redis.call('HGET', KEYS[2], id) == owner then
    redis.call('ZREM', KEYS[1], id)
    redis.call('HDEL', KEYS[2], id)
    redis.call('HDEL', KEYS[3], id)
  end
end
return 1
`;

const PROJECT_QUEUED_SCRIPT = `
if redis.call('ZSCORE', KEYS[2], ARGV[1]) then
  redis.call('HSET', KEYS[4], ARGV[1], ARGV[2])
else
  redis.call('ZADD', KEYS[1], ARGV[2], ARGV[1])
end
return 1
`;

const PROJECT_NOT_QUEUED_SCRIPT = `
redis.call('ZREM', KEYS[1], ARGV[1])
redis.call('ZREM', KEYS[2], ARGV[1])
redis.call('HDEL', KEYS[3], ARGV[1])
redis.call('HDEL', KEYS[4], ARGV[1])
return 1
`;

export interface QueueMember {
  ticketId: string;
  score: number;
  leaseOwner?: string;
}

/** Redis is a recoverable projection; leases prevent process crashes from permanently consuming tickets. */
@Injectable()
export class MatchingQueueStore {
  private readonly namespace: string;

  constructor(
    @Inject(MATCHING_REDIS) private readonly redis: Redis,
    private readonly config: ConfigService,
  ) {
    this.namespace = this.config.getOrThrow<string>('MATCHING_REDIS_NAMESPACE');
  }

  private get activeShardsKey(): string {
    return `${this.namespace}:shards:active`;
  }

  ageBand(ownAge: number): number {
    const bandSize = this.config.getOrThrow<number>('MATCHING_AGE_BAND_SIZE');
    return Math.floor(ownAge / bandSize) * bandSize;
  }

  shardKey(matchType: MatchType, region: string, ageBand: number): string {
    // Hash tag keeps ready/lease/owner/score for one shard in the same Redis Cluster slot.
    return `${this.namespace}:queue:{${matchType}:${region}:${ageBand}}:ready`;
  }

  scoreFor(ticket: Pick<MatchTicket, 'queuedAt' | 'priority' | 'priorityBoostMs'>): number {
    const boost = ticket.priority
      ? (ticket.priorityBoostMs ?? this.config.getOrThrow<number>('MATCHING_PRIORITY_BOOST_MS'))
      : 0;
    return ticket.queuedAt.getTime() - boost;
  }

  private leaseKeys(shardKey: string): [string, string, string] {
    return [`${shardKey}:leases`, `${shardKey}:lease-owner`, `${shardKey}:lease-score`];
  }

  async project(ticket: MatchTicket): Promise<void> {
    const shardKey = this.shardKey(ticket.matchType, ticket.region, this.ageBand(ticket.ownAge));
    const [leases, owners, scores] = this.leaseKeys(shardKey);
    if (ticket.status === MatchTicketStatus.Queued) {
      await this.redis.eval(
        PROJECT_QUEUED_SCRIPT,
        4,
        shardKey,
        leases,
        owners,
        scores,
        ticket.id,
        this.scoreFor(ticket),
      );
      // Global registry intentionally stays outside the shard-local Lua script (Cluster cross-slot safe).
      await this.redis.sadd(this.activeShardsKey, shardKey);
      return;
    }
    await this.redis.eval(PROJECT_NOT_QUEUED_SCRIPT, 4, shardKey, leases, owners, scores, ticket.id);
  }

  /** Convenience for tests/reconciliation; production mutations use the durable projection outbox. */
  async enqueue(shardKey: string, ticketId: string, score: number): Promise<void> {
    await this.redis.call('ZADD', shardKey, score.toString(), ticketId);
    await this.redis.sadd(this.activeShardsKey, shardKey);
  }

  async listActiveShards(): Promise<string[]> {
    return this.redis.smembers(this.activeShardsKey);
  }

  async cardinality(shardKey: string): Promise<number> {
    return this.redis.zcard(shardKey);
  }

  async remove(shardKey: string, ticketId: string): Promise<void> {
    const [leases, owners, scores] = this.leaseKeys(shardKey);
    await this.redis.eval(PROJECT_NOT_QUEUED_SCRIPT, 4, shardKey, leases, owners, scores, ticketId);
  }

  async reprioritize(shardKey: string, ticketId: string, newScore: number): Promise<void> {
    const [leases, , scores] = this.leaseKeys(shardKey);
    if (await this.redis.zscore(leases, ticketId)) await this.redis.hset(scores, ticketId, newScore.toString());
    else await this.redis.call('ZADD', shardKey, 'XX', newScore.toString(), ticketId);
  }

  async claimBatch(shardKey: string, count: number, owner: string): Promise<QueueMember[]> {
    const [leases, owners, scores] = this.leaseKeys(shardKey);
    const now = Date.now();
    const deadline = now + this.config.getOrThrow<number>('MATCHING_QUEUE_LEASE_MS');
    const raw = (await this.redis.eval(
      CLAIM_BATCH_SCRIPT,
      4,
      shardKey,
      leases,
      owners,
      scores,
      count,
      deadline,
      owner,
      now,
    )) as string[];
    const members: QueueMember[] = [];
    for (let i = 0; i < raw.length; i += 2) {
      members.push({ ticketId: raw[i], score: Number(raw[i + 1]), leaseOwner: owner });
    }
    return members;
  }

  async releaseClaims(shardKey: string, members: QueueMember[]): Promise<void> {
    if (members.length === 0) return;
    const [leases, owners, scores] = this.leaseKeys(shardKey);
    const args = members.flatMap((m) => [m.ticketId, m.leaseOwner ?? '']);
    await this.redis.eval(RELEASE_SCRIPT, 4, shardKey, leases, owners, scores, ...args);
  }

  async ackClaims(shardKey: string, members: QueueMember[]): Promise<void> {
    if (members.length === 0) return;
    const [leases, owners, scores] = this.leaseKeys(shardKey);
    const args = members.flatMap((m) => [m.ticketId, m.leaseOwner ?? '']);
    await this.redis.eval(ACK_SCRIPT, 3, leases, owners, scores, ...args);
  }
}
