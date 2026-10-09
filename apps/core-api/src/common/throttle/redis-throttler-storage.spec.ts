import { Logger } from '@nestjs/common';

import { closeCoreRedisClient } from '../redis/core-redis-client';
import { RedisThrottlerStorage } from './redis-throttler-storage';

import type Redis from 'ioredis';

jest.mock('../redis/core-redis-client', () => ({
  closeCoreRedisClient: jest.fn(async () => undefined),
}));

function makeStorage(evalImpl: jest.Mock) {
  const redis = { eval: evalImpl } as unknown as Redis;
  let now = 1_000_000;
  const storage = new RedisThrottlerStorage(redis, () => now);
  return {
    storage,
    redis,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe('RedisThrottlerStorage', () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('đếm trên Redis bằng 2 key cùng hash tag và đổi ms sang giây làm tròn lên', async () => {
    const evalMock = jest.fn(async () => [3, 59_001, 0, 0]);
    const { storage } = makeStorage(evalMock);

    const record = await storage.increment(
      'abc',
      60_000,
      100,
      60_000,
      'default',
    );

    expect(record).toEqual({
      totalHits: 3,
      timeToExpire: 60,
      isBlocked: false,
      timeToBlockExpire: 0,
    });
    const [, numKeys, hitsKey, blockKey, ttl, limit, blockMs] = evalMock.mock
      .calls[0] as unknown as [string, number, string, string, ...string[]];
    expect(numKeys).toBe(2);
    expect(hitsKey).toBe('throttle:{default:abc}:hits');
    expect(blockKey).toBe('throttle:{default:abc}:block');
    expect([ttl, limit, blockMs]).toEqual(['60000', '100', '60000']);
  });

  it('báo bị chặn kèm thời gian chặn còn lại khi script trả isBlocked', async () => {
    const { storage } = makeStorage(jest.fn(async () => [101, 0, 1, 4_200]));

    const record = await storage.increment(
      'abc',
      60_000,
      100,
      5_000,
      'default',
    );

    expect(record).toEqual({
      totalHits: 101,
      timeToExpire: 0,
      isBlocked: true,
      timeToBlockExpire: 5,
    });
  });

  it('Redis lỗi → dùng bộ đếm trong bộ nhớ của pod, request không bị lỗi', async () => {
    const { storage } = makeStorage(
      jest.fn(async () => {
        throw new Error('Command timed out');
      }),
    );

    const first = await storage.increment('k', 60_000, 2, 60_000, 'default');
    expect(first).toMatchObject({ totalHits: 1, isBlocked: false });
    await storage.onApplicationShutdown();
  });

  it('bộ đếm dự phòng vẫn chặn khi vượt hạn mức trong lúc Redis lỗi', async () => {
    const evalMock = jest.fn(async () => {
      throw new Error('ECONNRESET');
    });
    const { storage } = makeStorage(evalMock);

    const results = [];
    for (let i = 0; i < 3; i += 1) {
      results.push(await storage.increment('k', 60_000, 2, 60_000, 'default'));
    }

    expect(results.map((r) => r.isBlocked)).toEqual([false, false, true]);
    await storage.onApplicationShutdown();
  });

  it('sau lỗi bỏ qua Redis một lúc rồi thử lại, và chỉ cảnh báo thưa', async () => {
    const evalMock = jest
      .fn()
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValue([1, 60_000, 0, 0]);
    const { storage, advance } = makeStorage(evalMock);

    await storage.increment('k', 60_000, 10, 60_000, 'default');
    await storage.increment('k', 60_000, 10, 60_000, 'default');
    expect(evalMock).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);

    advance(5_001);
    const recovered = await storage.increment(
      'k',
      60_000,
      10,
      60_000,
      'default',
    );

    expect(evalMock).toHaveBeenCalledTimes(2);
    expect(recovered.totalHits).toBe(1);
    expect(warn).toHaveBeenCalledTimes(1);
    await storage.onApplicationShutdown();
  });

  it('shutdown giải phóng Redis client dùng chung', async () => {
    const { storage, redis } = makeStorage(jest.fn(async () => [1, 1, 0, 0]));

    await storage.onApplicationShutdown();

    expect(closeCoreRedisClient).toHaveBeenCalledWith(redis);
  });
});
