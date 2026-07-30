import {
  signalingRedisClientOptions,
  signalingRedisReconnectDelay,
} from './redis-client-options';

describe('signaling Redis reconnect policy', () => {
  it('backs off exponentially with jitter and a hard ceiling', () => {
    expect(signalingRedisReconnectDelay(1, () => 0)).toBe(375);
    expect(signalingRedisReconnectDelay(1, () => 1)).toBe(625);
    expect(signalingRedisReconnectDelay(100, () => 1)).toBe(15_000);
  });

  it('keeps command retries bounded and offline queue disabled', () => {
    expect(signalingRedisClientOptions()).toMatchObject({
      connectTimeout: 1_000,
      commandTimeout: 1_000,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: signalingRedisReconnectDelay,
    });
  });
});
