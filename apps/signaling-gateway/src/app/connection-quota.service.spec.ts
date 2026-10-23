import 'reflect-metadata'; // common-dtos kéo class-validator (cần Reflect.getMetadata)
import { EventEmitter } from 'node:events';
import Redis from 'ioredis';
import { realtimeShardIndex } from '@litmatch/common-dtos';

import { ConnectionQuotaService } from './connection-quota.service';

import type { ConfigService } from '@nestjs/config';
import type { SignalingEnv } from '../config/env.validation';

type PipelineResult = [Error | null, unknown];

jest.mock('ioredis', () => {
  class FakePipeline {
    calls: Array<[string, ...unknown[]]> = [];
    results: PipelineResult[] | null | undefined;
    quotaAcquire = (...args: unknown[]) => {
      this.calls.push(['quotaAcquire', ...args]);
      return this;
    };
    quotaRefresh = (...args: unknown[]) => {
      this.calls.push(['quotaRefresh', ...args]);
      return this;
    };
    quotaRelease = (...args: unknown[]) => {
      this.calls.push(['quotaRelease', ...args]);
      return this;
    };
    exec = jest.fn(async () =>
      this.results === undefined
        ? this.calls.map(() => [null, 1] as PipelineResult)
        : this.results,
    );
  }
  class FakeRedis extends EventEmitter {
    static instances: FakeRedis[] = [];
    status = 'ready';
    url: string;
    defineCommand = jest.fn();
    quotaAcquire = jest.fn();
    quotaRelease = jest.fn();
    eval = jest.fn(async () => 1);
    pipelines: FakePipeline[] = [];
    pendingResults: Array<PipelineResult[] | null | Error> = [];
    pipeline = jest.fn(() => {
      const pipeline = new FakePipeline();
      const next = this.pendingResults.shift();
      if (next instanceof Error) {
        pipeline.exec.mockRejectedValueOnce(next);
      } else if (next !== undefined) {
        pipeline.results = next;
      }
      this.pipelines.push(pipeline);
      return pipeline;
    });
    quit = jest.fn(async () => 'OK');
    disconnect = jest.fn();

    constructor(url: string) {
      super();
      this.url = url;
      FakeRedis.instances.push(this);
    }
  }
  return { __esModule: true, default: FakeRedis };
});

interface FakePipelineShape {
  calls: Array<[string, ...unknown[]]>;
  exec: jest.Mock;
}
type FakeRedis = Redis & {
  url: string;
  defineCommand: jest.Mock;
  quotaAcquire: jest.Mock;
  quotaRelease: jest.Mock;
  eval: jest.Mock;
  pipelines: FakePipelineShape[];
  pendingResults: Array<PipelineResult[] | null | Error>;
  quit: jest.Mock;
  disconnect: jest.Mock;
};
type FakeRedisCtor = typeof Redis & { instances: FakeRedis[] };

function makeService(realtimeUrls = ''): {
  service: ConnectionQuotaService;
  clients: FakeRedis[];
  coordinator: FakeRedis;
} {
  const config = {
    getOrThrow: (key: keyof SignalingEnv) => {
      if (key === 'REDIS_URL') return 'redis://default:6379';
      if (key === 'WS_CONNECTION_LEASE_MS') return 90_000;
      if (key === 'WS_MAX_CONNECTIONS_PER_USER') return 3;
      throw new Error(`unexpected config key ${key}`);
    },
    get: (key: keyof SignalingEnv) =>
      key === 'REALTIME_REDIS_URLS' ? realtimeUrls : undefined,
  } as unknown as ConfigService<SignalingEnv, true>;
  const service = new ConnectionQuotaService(config);
  const instances = (Redis as unknown as FakeRedisCtor).instances;
  const urls = realtimeUrls
    ? realtimeUrls.split(',')
    : ['redis://default:6379'];
  return {
    service,
    clients: instances.filter((client) => urls.includes(client.url)),
    coordinator: instances.find(
      (client) => client.url === 'redis://default:6379',
    )!,
  };
}

/** userId thuộc shard `shard` trong cụm `shardCount` shard. */
function userOnShard(shard: number, shardCount: number, skip = 0): string {
  let seen = 0;
  for (let index = 0; ; index += 1) {
    const id = `user-${index}`;
    if (realtimeShardIndex(id, shardCount) === shard && seen++ === skip) {
      return id;
    }
  }
}

describe('ConnectionQuotaService', () => {
  beforeEach(() => {
    (Redis as unknown as FakeRedisCtor).instances = [];
  });

  it('registers placement on the shared coordinator before accepting the topology', async () => {
    const { service, coordinator } = makeService(
      'redis://a:6379,redis://b:6379',
    );
    await service.onModuleInit();
    expect(coordinator.eval).toHaveBeenCalledWith(
      expect.any(String),
      1,
      'signaling:connection-quota-topology:v1',
      expect.stringMatching(/^[a-f0-9]{64}$/),
    );
    await service.onApplicationShutdown();
    expect(coordinator.quit).toHaveBeenCalledTimes(1);
  });

  it('rejects mixed placement instead of admitting a second quota for the same user', async () => {
    const { service, coordinator, clients } = makeService(
      'redis://a:6379,redis://b:6379',
    );
    coordinator.eval.mockResolvedValueOnce(0);
    await expect(service.onModuleInit()).rejects.toThrow('topology changed');
    expect(
      clients.every((client) => client.quotaAcquire.mock.calls.length === 0),
    ).toBe(true);
  });

  it('fails closed when the topology coordinator cannot confirm placement', async () => {
    const { service, coordinator } = makeService();
    coordinator.eval.mockRejectedValueOnce(new Error('coordinator down'));
    await expect(service.onModuleInit()).rejects.toThrow('coordinator down');
  });

  it('fingerprints shard order but allows credential rotation on the same endpoints', async () => {
    const fingerprint = async (urls: string) => {
      (Redis as unknown as FakeRedisCtor).instances = [];
      const { service, coordinator } = makeService(urls);
      await service.onModuleInit();
      return coordinator.eval.mock.calls[0][3];
    };
    const original = await fingerprint(
      'redis://old:password@a:6379/0,redis://b:6379/1',
    );
    expect(
      await fingerprint('redis://new:secret@a:6379/0,redis://b:6379/1'),
    ).toBe(original);
    expect(await fingerprint('redis://b:6379/1,redis://a:6379/0')).not.toBe(
      original,
    );
    expect(await fingerprint('redis://a:6379?db=13')).not.toBe(
      await fingerprint('redis://a:6379?db=15'),
    );
    expect(await fingerprint('redis://a:6379?keyPrefix=old:')).not.toBe(
      await fingerprint('redis://a:6379?keyPrefix=new:'),
    );
  });

  it('đăng ký 3 script atomic bằng defineCommand (EVALSHA) trên mỗi client', () => {
    const { clients } = makeService();

    expect(clients).toHaveLength(1);
    const definitions = clients[0].defineCommand.mock.calls;
    expect(definitions.map(([name]) => name)).toEqual([
      'quotaAcquire',
      'quotaRefresh',
      'quotaRelease',
    ]);
    for (const [, definition] of definitions) {
      expect(definition.numberOfKeys).toBe(2);
    }
    expect(definitions[0][1].lua).toContain("redis.call('ZCARD', KEYS[1])");
    expect(definitions[1][1].lua).toContain("redis.call('ZREMRANGEBYSCORE'");
    expect(definitions[2][1].lua).toContain(
      "redis.call('ZREM', KEYS[1], ARGV[1])",
    );
  });

  it('acquire dùng một script atomic với key user, lease TTL và global cap', async () => {
    const { service, clients } = makeService();
    clients[0].quotaAcquire.mockResolvedValueOnce(1);

    await expect(service.acquire('user-1', 'lease-1')).resolves.toBe(true);

    expect(clients[0].quotaAcquire).toHaveBeenCalledWith(
      'signaling:connection-quota:user-1',
      'realtime:presence:user-1',
      'lease-1',
      90_000,
      3,
    );
  });

  it('trả false khi script atomic báo quota đã đầy', async () => {
    const { service, clients } = makeService();
    clients[0].quotaAcquire.mockResolvedValueOnce(0);

    await expect(service.acquire('user-1', 'lease-4')).resolves.toBe(false);
  });

  it('không nuốt Redis failure để gateway fail closed', async () => {
    const { service, clients } = makeService();
    clients[0].quotaAcquire.mockRejectedValueOnce(
      new Error('redis unavailable'),
    );

    await expect(service.acquire('user-1', 'lease-1')).rejects.toThrow(
      'redis unavailable',
    );
  });

  it('release chỉ tác động đúng lease id', async () => {
    const { service, clients } = makeService();
    clients[0].quotaRelease.mockResolvedValueOnce(1);

    await service.release('user-1', 'lease-1');

    expect(clients[0].quotaRelease).toHaveBeenCalledWith(
      'signaling:connection-quota:user-1',
      'realtime:presence:user-1',
      'lease-1',
    );
  });

  describe('refreshMany — gia hạn gộp bằng pipeline', () => {
    it('một pipeline cho nhiều lease; ok/lost/error ánh xạ đúng theo thứ tự', async () => {
      const { service, clients } = makeService();
      clients[0].pendingResults.push([
        [null, 1],
        [null, 0],
        [new Error('boom'), undefined],
      ]);

      await expect(
        service.refreshMany([
          { userId: 'user-1', leaseId: 'lease-1' },
          { userId: 'user-2', leaseId: 'lease-2' },
          { userId: 'user-3', leaseId: 'lease-3' },
        ]),
      ).resolves.toEqual(['ok', 'lost', 'error']);

      expect(clients[0].pipelines).toHaveLength(1);
      expect(clients[0].pipelines[0].calls[0]).toEqual([
        'quotaRefresh',
        'signaling:connection-quota:user-1',
        'realtime:presence:user-1',
        'lease-1',
        90_000,
      ]);
      expect(clients[0].pipelines[0].calls).toHaveLength(3);
    });

    it('pipeline lỗi hoặc không trả kết quả → mọi lease là error, không throw', async () => {
      const { service, clients } = makeService();
      clients[0].pendingResults.push(new Error('connection closed'), null);
      const leases = [
        { userId: 'user-1', leaseId: 'lease-1' },
        { userId: 'user-2', leaseId: 'lease-2' },
      ];

      await expect(service.refreshMany(leases)).resolves.toEqual([
        'error',
        'error',
      ]);
      await expect(service.refreshMany(leases)).resolves.toEqual([
        'error',
        'error',
      ]);
    });

    it('chia pipeline tối đa 500 lệnh', async () => {
      const { service, clients } = makeService();
      const leases = Array.from({ length: 1_200 }, (_, index) => ({
        userId: `user-${index}`,
        leaseId: `lease-${index}`,
      }));

      const outcomes = await service.refreshMany(leases);

      expect(outcomes).toHaveLength(1_200);
      expect(outcomes.every((outcome) => outcome === 'ok')).toBe(true);
      expect(clients[0].pipelines.map((p) => p.calls.length)).toEqual([
        500, 500, 200,
      ]);
    });

    it('nhiều shard: mỗi user đi đúng client của shard, kết quả giữ nguyên thứ tự gốc', async () => {
      const { service, clients } = makeService(
        'redis://shard-0:6379,redis://shard-1:6379',
      );
      expect(clients.map((client) => client.url)).toEqual([
        'redis://shard-0:6379',
        'redis://shard-1:6379',
      ]);
      const a = userOnShard(0, 2);
      const b = userOnShard(1, 2);
      const c = userOnShard(0, 2, 1);
      clients[0].pendingResults.push([
        [null, 1],
        [null, 0],
      ]);
      clients[1].pendingResults.push([[null, 1]]);

      const outcomes = await service.refreshMany([
        { userId: a, leaseId: 'la' },
        { userId: b, leaseId: 'lb' },
        { userId: c, leaseId: 'lc' },
      ]);

      expect(outcomes).toEqual(['ok', 'ok', 'lost']);
      expect(clients[0].pipelines[0].calls.map((call) => call[3])).toEqual([
        'la',
        'lc',
      ]);
      expect(clients[1].pipelines[0].calls.map((call) => call[3])).toEqual([
        'lb',
      ]);
    });
  });

  it('acquire/release nhiều shard chạm đúng shard của user', async () => {
    const { service, clients } = makeService(
      'redis://shard-0:6379,redis://shard-1:6379',
    );
    clients[1].quotaAcquire.mockResolvedValueOnce(1);
    const onShard1 = userOnShard(1, 2);

    await service.acquire(onShard1, 'lease-1');

    expect(clients[1].quotaAcquire).toHaveBeenCalledTimes(1);
    expect(clients[0].quotaAcquire).not.toHaveBeenCalled();
  });

  it('releaseMany nuốt lỗi pipeline (lease có TTL)', async () => {
    const { service, clients } = makeService();
    clients[0].pendingResults.push(new Error('connection closed'));

    await expect(
      service.releaseMany([{ userId: 'user-1', leaseId: 'lease-1' }]),
    ).resolves.toBeUndefined();
  });

  it('isReady chỉ true khi MỌI shard sẵn sàng', () => {
    const { service, clients } = makeService(
      'redis://shard-0:6379,redis://shard-1:6379',
    );
    expect(service.isReady()).toBe(true);
    Object.assign(clients[1], { status: 'reconnecting' });
    expect(service.isReady()).toBe(false);
  });

  it('Redis đóng kết nối KHÔNG kích hoạt ngắt hàng loạt — chỉ client lỗi được ghi log', () => {
    const { clients } = makeService();

    expect(() => {
      clients[0].emit('close');
      clients[0].emit('end');
      clients[0].emit('error', new Error('ECONNRESET'));
    }).not.toThrow();
  });

  it('shutdown disconnect cưỡng bức khi QUIT lỗi', async () => {
    const { service, clients } = makeService();
    clients[0].quit.mockRejectedValueOnce(new Error('not writable'));

    await service.onApplicationShutdown();

    expect(clients[0].quit).toHaveBeenCalledTimes(1);
    expect(clients[0].disconnect).toHaveBeenCalledTimes(1);
  });
});

describe('ConnectionQuotaService — shard hỏng, cấp lại lease', () => {
  beforeEach(() => {
    (Redis as unknown as FakeRedisCtor).instances = [];
  });

  it('reacquireMany dùng script acquire idempotent (cùng leaseId, có trần socket) và ánh xạ kết quả', async () => {
    const { service, clients } = makeService();
    clients[0].pendingResults.push([
      [null, 1],
      [null, 0],
      [new Error('boom'), undefined],
    ]);

    await expect(
      service.reacquireMany([
        { userId: 'user-1', leaseId: 'lease-1' },
        { userId: 'user-2', leaseId: 'lease-2' },
        { userId: 'user-3', leaseId: 'lease-3' },
      ]),
    ).resolves.toEqual(['ok', 'lost', 'error']);

    expect(clients[0].pipelines[0].calls[0]).toEqual([
      'quotaAcquire',
      'signaling:connection-quota:user-1',
      'realtime:presence:user-1',
      'lease-1',
      90_000,
      3,
    ]);
  });

  it('reacquireMany không throw khi pipeline lỗi hẳn', async () => {
    const { service, clients } = makeService();
    clients[0].pendingResults.push(new Error('connection closed'));

    await expect(
      service.reacquireMany([{ userId: 'user-1', leaseId: 'lease-1' }]),
    ).resolves.toEqual(['error']);
  });

  it('isShardReady tách từng shard; isReady chỉ true khi mọi shard sẵn sàng', () => {
    const { service, clients } = makeService(
      'redis://shard-0:6379,redis://shard-1:6379',
    );
    Object.assign(clients[1], { status: 'reconnecting' });

    expect(service.isShardReady(0)).toBe(true);
    expect(service.isShardReady(1)).toBe(false);
    expect(service.isShardReady(2)).toBe(false); // không có shard thứ ba
    expect(service.isReady()).toBe(false);
  });

  it('khởi động được khi chỉ một shard lên (shard chết không chặn cả pod)', async () => {
    const { service, clients } = makeService(
      'redis://shard-0:6379,redis://shard-1:6379',
    );
    Object.assign(clients[0], { status: 'connecting' });
    const init = service.onModuleInit();
    clients[0].emit('error', new Error('ECONNREFUSED shard-0'));

    await expect(init).resolves.toBeUndefined();
  });

  it('khởi động thất bại khi KHÔNG shard nào lên được (ném lỗi gốc như trước)', async () => {
    const { service, clients } = makeService(
      'redis://shard-0:6379,redis://shard-1:6379',
    );
    Object.assign(clients[0], { status: 'connecting' });
    Object.assign(clients[1], { status: 'connecting' });
    const init = service.onModuleInit();
    clients[0].emit('error', new Error('ECONNREFUSED shard-0'));
    clients[1].emit('error', new Error('ECONNREFUSED shard-1'));

    await expect(init).rejects.toThrow('ECONNREFUSED shard-0');
  });
});
