import { randomUUID } from 'node:crypto';

import Redis from 'ioredis';

import { RedisThrottlerStorage } from './redis-throttler-storage';

/**
 * Kiểm chứng script Lua trên Redis THẬT (unit test chỉ mock `eval`): bộ đếm dùng chung giữa 2 "pod",
 * chặn khi vượt hạn mức, bộ đếm bắt đầu lại đúng lúc hết chặn và khi hết cửa sổ.
 * Cùng công tắc INTEGRATION_DB_URL với các suite integration khác; chỉ cần Redis.
 */
const INTEGRATION_DB_URL = process.env['INTEGRATION_DB_URL'];
const d = INTEGRATION_DB_URL ? describe : describe.skip;
if (!INTEGRATION_DB_URL) {
  console.warn(
    '[redis-throttler-storage.integration] BỎ QUA — set INTEGRATION_DB_URL để chạy test script Lua trên Redis thật',
  );
}

jest.setTimeout(30_000);

const REDIS_URL = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

d('RedisThrottlerStorage — script Lua trên Redis thật', () => {
  let podA: RedisThrottlerStorage;
  let podB: RedisThrottlerStorage;

  beforeAll(() => {
    podA = new RedisThrottlerStorage(new Redis(REDIS_URL));
    podB = new RedisThrottlerStorage(new Redis(REDIS_URL));
  });

  afterAll(async () => {
    await podA.onApplicationShutdown();
    await podB.onApplicationShutdown();
  });

  it('2 pod cùng đếm vào một bộ đếm', async () => {
    const key = `shared-${randomUUID()}`;

    const hits = [
      await podA.increment(key, 10_000, 100, 10_000, 'default'),
      await podB.increment(key, 10_000, 100, 10_000, 'default'),
      await podA.increment(key, 10_000, 100, 10_000, 'default'),
    ].map((record) => record.totalHits);

    expect(hits).toEqual([1, 2, 3]);
  });

  it('vượt hạn mức thì bị chặn, hết chặn thì bộ đếm bắt đầu lại từ 1', async () => {
    const key = `block-${randomUUID()}`;
    const hit = (pod: RedisThrottlerStorage) =>
      pod.increment(key, 10_000, 2, 1_500, 'default');

    expect((await hit(podA)).isBlocked).toBe(false);
    expect((await hit(podB)).isBlocked).toBe(false);
    const blocked = await hit(podA);
    expect(blocked.isBlocked).toBe(true);
    expect(blocked.timeToBlockExpire).toBeGreaterThan(0);
    // đang bị chặn: mọi pod đều thấy bị chặn và lượt mới không được tính
    expect((await hit(podB)).isBlocked).toBe(true);

    await sleep(1_700);

    const afterBlock = await hit(podB);
    expect(afterBlock).toMatchObject({ totalHits: 1, isBlocked: false });
  });

  it('hết cửa sổ thì bộ đếm bắt đầu lại', async () => {
    const key = `window-${randomUUID()}`;

    await podA.increment(key, 1_000, 100, 1_000, 'default');
    await podA.increment(key, 1_000, 100, 1_000, 'default');
    await sleep(1_200);
    const next = await podB.increment(key, 1_000, 100, 1_000, 'default');

    expect(next.totalHits).toBe(1);
  });

  it('hai throttler cùng khóa tracker không dẫm lên nhau', async () => {
    const key = `named-${randomUUID()}`;

    await podA.increment(key, 10_000, 100, 10_000, 'short');
    await podA.increment(key, 10_000, 100, 10_000, 'short');
    const other = await podB.increment(key, 10_000, 100, 10_000, 'long');

    expect(other.totalHits).toBe(1);
  });
});
