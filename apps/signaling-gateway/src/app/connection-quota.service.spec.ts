import { EventEmitter } from 'node:events';
import Redis from 'ioredis';

import { ConnectionQuotaService } from './connection-quota.service';

import type { ConfigService } from '@nestjs/config';
import type { SignalingEnv } from '../config/env.validation';

jest.mock('ioredis', () => {
  class FakeRedis extends EventEmitter {
    static instances: FakeRedis[] = [];
    status = 'ready';
    eval = jest.fn();
    quit = jest.fn(async () => 'OK');
    disconnect = jest.fn();

    constructor() {
      super();
      FakeRedis.instances.push(this);
    }
  }
  return { __esModule: true, default: FakeRedis };
});

type FakeRedis = Redis & {
  eval: jest.Mock;
  quit: jest.Mock;
  disconnect: jest.Mock;
};
type FakeRedisCtor = typeof Redis & { instances: FakeRedis[] };

function makeService(): { service: ConnectionQuotaService; redis: FakeRedis } {
  const config = {
    getOrThrow: (key: keyof SignalingEnv) => {
      if (key === 'REDIS_URL') return 'redis://localhost:6379';
      if (key === 'WS_CONNECTION_LEASE_MS') return 90_000;
      if (key === 'WS_MAX_CONNECTIONS_PER_USER') return 3;
      throw new Error(`unexpected config key ${key}`);
    },
  } as unknown as ConfigService<SignalingEnv, true>;
  const service = new ConnectionQuotaService(config);
  const instances = (Redis as unknown as FakeRedisCtor).instances;
  return { service, redis: instances[instances.length - 1] };
}

describe('ConnectionQuotaService', () => {
  beforeEach(() => {
    (Redis as unknown as FakeRedisCtor).instances = [];
  });

  it('acquire dùng một EVAL atomic với key user, lease TTL và global cap', async () => {
    const { service, redis } = makeService();
    redis.eval.mockResolvedValueOnce(1);

    await expect(service.acquire('user-1', 'lease-1')).resolves.toBe(true);

    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('ZCARD', KEYS[1])"),
      2,
      'signaling:connection-quota:user-1',
      'realtime:presence:user-1',
      'lease-1',
      90_000,
      3,
    );
  });

  it('trả false khi script atomic báo quota đã đầy', async () => {
    const { service, redis } = makeService();
    redis.eval.mockResolvedValueOnce(0);

    await expect(service.acquire('user-1', 'lease-4')).resolves.toBe(false);
  });

  it('refresh và release chỉ tác động đúng lease id', async () => {
    const { service, redis } = makeService();
    redis.eval.mockResolvedValueOnce(1).mockResolvedValueOnce(1);

    await expect(service.refresh('user-1', 'lease-1')).resolves.toBe(true);
    await service.release('user-1', 'lease-1');

    expect(redis.eval.mock.calls[0]).toEqual([
      expect.stringContaining("redis.call('ZREMRANGEBYSCORE'"),
      2,
      'signaling:connection-quota:user-1',
      'realtime:presence:user-1',
      'lease-1',
      90_000,
    ]);
    expect(redis.eval.mock.calls[1]).toEqual([
      expect.stringContaining("redis.call('ZREM', KEYS[1], ARGV[1])"),
      2,
      'signaling:connection-quota:user-1',
      'realtime:presence:user-1',
      'lease-1',
    ]);
  });

  it('không nuốt Redis failure để gateway fail closed', async () => {
    const { service, redis } = makeService();
    redis.eval.mockRejectedValueOnce(new Error('redis unavailable'));

    await expect(service.acquire('user-1', 'lease-1')).rejects.toThrow(
      'redis unavailable',
    );
  });

  it('shutdown disconnect cưỡng bức khi QUIT lỗi', async () => {
    const { service, redis } = makeService();
    redis.quit.mockRejectedValueOnce(new Error('not writable'));

    await service.onApplicationShutdown();

    expect(redis.quit).toHaveBeenCalledTimes(1);
    expect(redis.disconnect).toHaveBeenCalledTimes(1);
  });
});
