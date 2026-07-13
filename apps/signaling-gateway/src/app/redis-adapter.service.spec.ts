import Redis from 'ioredis';

import { SignalingRedisAdapterService } from './redis-adapter.service';

/**
 * Fake ioredis tối thiểu — chỉ đủ để test lifecycle connect/ready/shutdown của service,
 * KHÔNG thay thế cho integration test Redis thật (docs/services/realtime-gateway.md).
 * Instance thật/end-to-end (cross-instance emit) được verify ở
 * `signaling.horizontal-scale.integration.spec.ts`.
 */
jest.mock('ioredis', () => {
  const { EventEmitter } = require('node:events');
  class FakeRedis extends EventEmitter {
    static instances: FakeRedis[] = [];
    status = 'connecting';
    quit = jest.fn(async () => {
      this.status = 'end';
    });
    constructor() {
      super();
      FakeRedis.instances.push(this);
    }
    duplicate(): FakeRedis {
      return new FakeRedis();
    }
  }
  return { __esModule: true, default: FakeRedis };
});

type FakeRedisCtor = typeof Redis & {
  instances: Array<Redis & { status: string }>;
};

function markReady(client: Redis): void {
  (client as unknown as { status: string }).status = 'ready';
  client.emit('ready');
}

describe('SignalingRedisAdapterService', () => {
  beforeEach(() => {
    (Redis as unknown as FakeRedisCtor).instances = [];
  });

  it('connect() resolve adapter constructor sau khi CẢ 2 client (pub + sub duplicate) ready', async () => {
    const service = new SignalingRedisAdapterService();
    const connectPromise = service.connect('redis://localhost:6379');

    expect(service.isReady()).toBe(false);
    const instances = (Redis as unknown as FakeRedisCtor).instances;
    expect(instances).toHaveLength(2); // pubClient + subClient (duplicate())

    markReady(instances[0]);
    expect(service.isReady()).toBe(false); // mới 1/2 client ready
    markReady(instances[1]);

    const adapterConstructor = await connectPromise;
    expect(typeof adapterConstructor).toBe('function');
    expect(service.isReady()).toBe(true);
  });

  it('pubClient lỗi trước khi ready → connect() reject', async () => {
    const service = new SignalingRedisAdapterService();
    const connectPromise = service.connect('redis://localhost:6379');
    const [pubClient] = (Redis as unknown as FakeRedisCtor).instances;

    pubClient.emit('error', new Error('ECONNREFUSED'));
    await expect(connectPromise).rejects.toThrow('ECONNREFUSED');
  });

  it('onApplicationShutdown() quit cả 2 client', async () => {
    const service = new SignalingRedisAdapterService();
    const connectPromise = service.connect('redis://localhost:6379');
    const instances = (Redis as unknown as FakeRedisCtor).instances;
    instances.forEach(markReady);
    await connectPromise;

    await service.onApplicationShutdown();
    for (const client of instances) {
      expect(client.quit).toHaveBeenCalledTimes(1);
    }
  });

  it('onApplicationShutdown() trước khi connect() không throw (chưa có client nào)', async () => {
    const service = new SignalingRedisAdapterService();
    await expect(service.onApplicationShutdown()).resolves.toBeUndefined();
  });
});
