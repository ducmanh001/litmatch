import { Logger } from '@nestjs/common';

import { fnv1aHash } from '../../../common/hash/fnv1a';
import type { MatchingQueuePort } from '../ports/matching-queue.port';

/** Keep each logical queue and its atomic pair claim on one physical Redis instance. */
export class ShardedMatchingQueue implements MatchingQueuePort {
  private readonly logger = new Logger(ShardedMatchingQueue.name);

  constructor(private readonly shards: readonly MatchingQueuePort[]) {
    if (shards.length === 0)
      throw new Error('Matching requires at least one Redis shard');
  }

  private shard(key: string): MatchingQueuePort {
    return this.shards[fnv1aHash(key) % this.shards.length];
  }

  enqueue(...args: Parameters<MatchingQueuePort['enqueue']>) {
    return this.shard(args[0]).enqueue(...args);
  }

  remove(...args: Parameters<MatchingQueuePort['remove']>) {
    return this.shard(args[0]).remove(...args);
  }

  peekWindow(...args: Parameters<MatchingQueuePort['peekWindow']>) {
    return this.shard(args[0]).peekWindow(...args);
  }

  claimPair(...args: Parameters<MatchingQueuePort['claimPair']>) {
    return this.shard(args[0]).claimPair(...args);
  }

  async listActiveShards(): Promise<string[]> {
    const results = await Promise.allSettled(
      this.shards.map((shard) => shard.listActiveShards()),
    );
    const active = new Set<string>();
    let healthy = 0;
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        this.logger.warn({ shard: index }, 'Matching Redis shard unavailable');
        return;
      }
      healthy++;
      for (const key of result.value) {
        // Old active-set entries must never redirect a queue after a coordinated topology change.
        if (this.shard(key) === this.shards[index]) active.add(key);
      }
    });
    if (healthy === 0)
      throw new Error('All Matching Redis shards are unavailable');
    return [...active];
  }

  markActive(key: string) {
    return this.shard(key).markActive(key);
  }
  unmarkActive(key: string) {
    return this.shard(key).unmarkActive(key);
  }
  hasEntries(key: string) {
    return this.shard(key).hasEntries(key);
  }

  async close(): Promise<void> {
    await Promise.all(this.shards.map((shard) => shard.close()));
  }
}
