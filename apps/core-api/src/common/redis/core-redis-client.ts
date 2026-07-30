import Redis from 'ioredis';

const REDIS_RECONNECT_BASE_MS = 250;
const REDIS_RECONNECT_MAX_MS = 15_000;
const REDIS_RECONNECT_JITTER_RATIO = 0.25;

interface SharedRedisEntry {
  client: Redis;
  references: number;
}

const sharedClientsByUrl = new Map<string, SharedRedisEntry>();
const sharedEntryByClient = new WeakMap<Redis, SharedRedisEntry>();
const fullyReleasedClients = new WeakSet<Redis>();

/** Exponential backoff + jitter prevents every pod reconnecting to hosted Redis in lock-step. */
export function coreRedisReconnectDelay(
  attempt: number,
  random: () => number = Math.random,
): number {
  const exponent = Math.min(Math.max(attempt - 1, 0), 6);
  const capped = Math.min(
    REDIS_RECONNECT_BASE_MS * 2 ** exponent,
    REDIS_RECONNECT_MAX_MS,
  );
  const jitter =
    1 -
    REDIS_RECONNECT_JITTER_RATIO +
    random() * REDIS_RECONNECT_JITTER_RATIO * 2;
  return Math.min(Math.round(capped * jitter), REDIS_RECONNECT_MAX_MS);
}

/**
 * Redis command client dùng chung trong một process core-api.
 *
 * Các module vẫn inject token riêng để giữ boundary, nhưng publish/queue commands có thể multiplex
 * an toàn trên cùng một ioredis connection. Subscriber-mode connection không đi qua helper này.
 * Không xếp hàng vô hạn command khi Upstash/Redis mất kết nối: request/job sẽ fail nhanh
 * và retry ở boundary tương ứng, thay vì tích luỹ promise làm phình RAM.
 */
export function createCoreRedisClient(redisUrl: string): Redis {
  const existing = sharedClientsByUrl.get(redisUrl);
  if (existing && existing.client.status !== 'end') {
    existing.references += 1;
    return existing.client;
  }

  const client = new Redis(redisUrl, {
    connectTimeout: 1_000,
    commandTimeout: 1_000,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: coreRedisReconnectDelay,
  });
  // ioredis emits errors asynchronously; always consume them at the shared boundary.
  client.on('error', () => undefined);
  const entry = { client, references: 1 };
  sharedClientsByUrl.set(redisUrl, entry);
  sharedEntryByClient.set(client, entry);
  return client;
}

/**
 * Đóng Redis client mà không để reconnect timer/socket giữ process sống khi `QUIT` không gửi
 * được (thường xảy ra lúc connection đang reconnect và offline queue đã tắt).
 */
export async function closeCoreRedisClient(client: Redis): Promise<void> {
  if (fullyReleasedClients.has(client)) return;
  const shared = sharedEntryByClient.get(client);
  if (shared) {
    shared.references -= 1;
    if (shared.references > 0) return;
    for (const [redisUrl, entry] of sharedClientsByUrl) {
      if (entry === shared) sharedClientsByUrl.delete(redisUrl);
    }
    sharedEntryByClient.delete(client);
  }
  fullyReleasedClients.add(client);

  try {
    await client.quit();
  } catch {
    client.disconnect();
  }
}
