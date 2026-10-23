import 'reflect-metadata';
import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';

import { ConnectionQuotaService } from './connection-quota.service';
import type { ConfigService } from '@nestjs/config';
import type { SignalingEnv } from '../config/env.validation';

const integration = process.env['INTEGRATION_DB_URL']
  ? describe
  : describe.skip;
const baseUrl = new URL(process.env['REDIS_URL'] ?? 'redis://127.0.0.1:6379');
const redisDb = (database: number) => {
  const url = new URL(baseUrl);
  url.pathname = `/${database}`;
  return url.toString();
};
const coordinatorUrl = redisDb(14);
const shardA = redisDb(13);
const shardB = redisDb(15);
const topologyKey = 'signaling:connection-quota-topology:v1';

integration(
  'quota topology cutover — real Redis, isolated databases 13/14/15',
  () => {
    const services: ConnectionQuotaService[] = [];
    let coordinator: Redis;

    function service(urls: string) {
      const config = {
        getOrThrow: (key: keyof SignalingEnv) => {
          if (key === 'REDIS_URL') return coordinatorUrl;
          if (key === 'WS_CONNECTION_LEASE_MS') return 10_000;
          if (key === 'WS_MAX_CONNECTIONS_PER_USER') return 3;
          throw new Error(`Unexpected key ${key}`);
        },
        get: () => urls,
      } as unknown as ConfigService<SignalingEnv, true>;
      const instance = new ConnectionQuotaService(config);
      services.push(instance);
      return instance;
    }

    beforeAll(async () => {
      coordinator = new Redis(coordinatorUrl);
      await coordinator.ping();
    });
    beforeEach(async () => {
      await coordinator.del(topologyKey);
    });
    afterEach(async () => {
      await Promise.all(
        services.splice(0).map((instance) => instance.onApplicationShutdown()),
      );
      await coordinator.del(topologyKey);
    });
    afterAll(async () => {
      await coordinator?.quit();
    });

    it('same-placement replicas share one cap and registration persists after shutdown', async () => {
      const first = service(`${shardA},${shardB}`);
      const second = service(`${shardA},${shardB}`);
      await Promise.all([first.onModuleInit(), second.onModuleInit()]);
      const user = randomUUID();
      expect(await first.acquire(user, 'one')).toBe(true);
      expect(await second.acquire(user, 'two')).toBe(true);
      expect(await first.acquire(user, 'three')).toBe(true);
      expect(await second.acquire(user, 'four')).toBe(false);
      await first.onApplicationShutdown();
      services.splice(services.indexOf(first), 1);
      expect(await coordinator.ttl(topologyKey)).toBe(-1);
      await second.releaseMany(
        ['one', 'two', 'three'].map((leaseId) => ({ userId: user, leaseId })),
      );
    });

    it('rejects query-string database remapping even when the endpoint and path match', async () => {
      const queryDb = (database: number) => {
        const url = new URL(baseUrl);
        url.pathname = '';
        url.search = `?db=${database}`;
        return url.toString();
      };
      const original = service(queryDb(13));
      await original.onModuleInit();
      const user = randomUUID();
      expect(await original.acquire(user, 'one')).toBe(true);
      expect(await original.acquire(user, 'two')).toBe(true);
      expect(await original.acquire(user, 'three')).toBe(true);
      const replacement = service(queryDb(15));
      await expect(replacement.onModuleInit()).rejects.toThrow(
        'topology changed',
      );
      expect(await original.acquire(user, 'four')).toBe(false);
      await original.releaseMany(
        ['one', 'two', 'three'].map((leaseId) => ({ userId: user, leaseId })),
      );
    });

    it('rejects reordered or added shards until an explicit drained cutover', async () => {
      const first = service(`${shardA},${shardB}`);
      await first.onModuleInit();
      const reordered = service(`${shardB},${shardA}`);
      await expect(reordered.onModuleInit()).rejects.toThrow(
        'topology changed',
      );
      const added = service(`${shardA},${shardB},${redisDb(12)}`);
      await expect(added.onModuleInit()).rejects.toThrow('topology changed');
      // This suite has no accepted sockets/leases: draining all instances is sufficient here.
      await Promise.all(
        services.splice(0).map((instance) => instance.onApplicationShutdown()),
      );
      await coordinator.del(topologyKey);
      const replacement = service(`${shardB},${shardA}`);
      await expect(replacement.onModuleInit()).resolves.toBeUndefined();
    });
  },
);
