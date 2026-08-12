/**
 * Capability port for the derived Matching queue.
 * Postgres remains the source of truth for ticket state; this port only exposes
 * the Redis sorted-set/index operations required by the matcher.
 */
export interface MatchingQueuePort {
  enqueue(
    shard: string,
    score: string,
    ticketId: string,
    mode: 'NX' | 'XX',
  ): Promise<void>;
  remove(shard: string, ticketId: string): Promise<void>;
  popMin(shard: string, count: number): Promise<Array<[string, string]>>;
  listActiveShards(): Promise<string[]>;
  markActive(shard: string): Promise<void>;
  unmarkActive(shard: string): Promise<void>;
  hasEntries(shard: string): Promise<boolean>;
  close(): Promise<void>;
}
