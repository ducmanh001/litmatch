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
  /**
   * Đọc (KHÔNG lấy ra) tối đa `max` ticket điểm thấp nhất của shard, theo thứ tự ưu tiên giảm dần.
   * Chỉ đọc nên matcher có thể xét nhiều ứng viên mà không phải trả lại những ticket không dùng.
   */
  peekWindow(shard: string, max: number): Promise<Array<[string, string]>>;
  /**
   * Lấy CẢ HAI ticket ra khỏi shard trong một bước atomic, hoặc không lấy gì. Trả `false` khi
   * một trong hai đã bị matcher khác lấy (hoặc đã bị xoá) — đây là "double-lock" ghép cặp:
   * một ticket không bao giờ nằm trong hai cặp.
   */
  claimPair(shard: string, ticketA: string, ticketB: string): Promise<boolean>;
  listActiveShards(): Promise<string[]>;
  markActive(shard: string): Promise<void>;
  unmarkActive(shard: string): Promise<void>;
  hasEntries(shard: string): Promise<boolean>;
  close(): Promise<void>;
}
