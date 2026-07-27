import Redis from 'ioredis';

/**
 * Redis client cho các module core-api.
 * Không xếp hàng vô hạn command khi Upstash/Redis mất kết nối: request/job sẽ fail nhanh
 * và retry ở boundary tương ứng, thay vì tích luỹ promise làm phình RAM.
 */
export function createCoreRedisClient(redisUrl: string): Redis {
  const client = new Redis(redisUrl, {
    connectTimeout: 1_000,
    commandTimeout: 1_000,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: (attempt) => Math.min(attempt * 100, 1_000),
  });
  // ioredis emits errors asynchronously; always consume them at the shared boundary.
  client.on('error', () => undefined);
  return client;
}
