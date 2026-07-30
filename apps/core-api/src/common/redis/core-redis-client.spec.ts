jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    status: 'ready',
    on: jest.fn(),
    quit: jest.fn(async () => 'OK'),
    disconnect: jest.fn(),
  })),
}));

import Redis from 'ioredis';

import {
  closeCoreRedisClient,
  coreRedisReconnectDelay,
  createCoreRedisClient,
} from './core-redis-client';

describe('core Redis client', () => {
  beforeEach(() => jest.clearAllMocks());

  it('uses bounded exponential reconnect backoff with jitter', () => {
    expect(coreRedisReconnectDelay(1, () => 0)).toBe(188);
    expect(coreRedisReconnectDelay(1, () => 1)).toBe(313);
    expect(coreRedisReconnectDelay(100, () => 1)).toBe(15_000);
  });

  it('shares one command connection per URL and closes it after the final owner', async () => {
    const first = createCoreRedisClient('redis://shared-test');
    const second = createCoreRedisClient('redis://shared-test');

    expect(first).toBe(second);
    expect(Redis).toHaveBeenCalledTimes(1);

    await closeCoreRedisClient(first);
    expect(first.quit).not.toHaveBeenCalled();

    await closeCoreRedisClient(second);
    expect(first.quit).toHaveBeenCalledTimes(1);

    const replacement = createCoreRedisClient('redis://shared-test');
    expect(replacement).not.toBe(first);
    expect(Redis).toHaveBeenCalledTimes(2);
    await closeCoreRedisClient(replacement);
  });
});
