import { closeCoreRedisClient } from './core-redis-client';

import type Redis from 'ioredis';

function redisStub(options?: { quitError?: Error }) {
  return {
    quit: jest.fn(
      options?.quitError
        ? () => Promise.reject(options.quitError)
        : () => Promise.resolve('OK'),
    ),
    disconnect: jest.fn(),
  } as unknown as Redis;
}

describe('closeCoreRedisClient', () => {
  it('đóng graceful bằng QUIT khi connection còn ghi được', async () => {
    const redis = redisStub();

    await closeCoreRedisClient(redis);

    expect(redis.quit).toHaveBeenCalledTimes(1);
    expect(redis.disconnect).not.toHaveBeenCalled();
  });

  it('buộc disconnect khi QUIT thất bại trong lúc reconnect', async () => {
    const redis = redisStub({ quitError: new Error("Stream isn't writeable") });

    await closeCoreRedisClient(redis);

    expect(redis.quit).toHaveBeenCalledTimes(1);
    expect(redis.disconnect).toHaveBeenCalledTimes(1);
  });
});
