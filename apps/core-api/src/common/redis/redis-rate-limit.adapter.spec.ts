import type Redis from 'ioredis';

import { RedisRateLimitAdapter } from './redis-rate-limit.adapter';

interface AtomicRedisState {
  counts: Map<string, number>;
  reservations: Map<string, string>;
  windows: Map<string, string>;
}

function createAtomicRedis(): { redis: Redis; state: AtomicRedisState } {
  const state: AtomicRedisState = {
    counts: new Map(),
    reservations: new Map(),
    windows: new Map(),
  };
  const evalMock = jest.fn(async (...args: unknown[]) => {
    const [, , rateLimitKey, reservationKey, windowKey, ...scriptArgs] =
      args as [string, number, string, string, string, ...string[]];

    if (scriptArgs.length === 3) {
      const [limit, , proposedWindow] = scriptArgs;
      const existingReservation = state.reservations.get(reservationKey);
      if (existingReservation) return [2, existingReservation];

      const next = (state.counts.get(rateLimitKey) ?? 0) + 1;
      state.counts.set(rateLimitKey, next);
      if (next > Number(limit)) {
        state.counts.set(rateLimitKey, next - 1);
        return [0, ''];
      }

      const window = state.windows.get(windowKey) ?? proposedWindow;
      state.windows.set(windowKey, window);
      state.reservations.set(reservationKey, window);
      return [1, window];
    }

    const reservationWindow = state.reservations.get(reservationKey);
    if (!reservationWindow) return 0;
    state.reservations.delete(reservationKey);
    if (state.windows.get(windowKey) !== reservationWindow) return 0;

    const count = state.counts.get(rateLimitKey) ?? 0;
    if (count <= 0) return 0;
    state.counts.set(rateLimitKey, count - 1);
    return 1;
  });

  return { redis: { eval: evalMock } as unknown as Redis, state };
}

describe('RedisRateLimitAdapter', () => {
  it('allows only the configured concurrent slots; blocked calls leave no counter or reservation', async () => {
    const { redis, state } = createAtomicRedis();
    const adapter = new RedisRateLimitAdapter(redis);

    const results = await Promise.all(
      Array.from({ length: 12 }, () =>
        adapter.consume({
          key: 'rate-limit:nearby:user-1',
          limit: 4,
          windowSeconds: 60,
        }),
      ),
    );

    expect(results.filter((result) => result.allowed)).toHaveLength(4);
    expect(state.counts.get('rate-limit:nearby:user-1')).toBe(4);
    expect(state.reservations.size).toBe(4);
    expect((redis.eval as jest.Mock).mock.calls[0][0]).toContain(
      "redis.call('INCR'",
    );
  });

  it('deduplicates a reservation ID and refunds it only once', async () => {
    const { redis, state } = createAtomicRedis();
    const adapter = new RedisRateLimitAdapter(redis);
    const request = {
      key: 'rate-limit:invite:user-1',
      limit: 1,
      windowSeconds: 60,
      operationId: 'request-123',
    };

    const first = await adapter.consume(request);
    const duplicate = await adapter.consume(request);

    expect(first).toMatchObject({ allowed: true, deduplicated: false });
    expect(duplicate).toMatchObject({ allowed: true, deduplicated: true });
    expect(state.counts.get(request.key)).toBe(1);

    if (!first.allowed) throw new Error('Expected rate-limit reservation');
    await expect(adapter.refund(first.reservation)).resolves.toBe(true);
    await expect(adapter.refund(first.reservation)).resolves.toBe(false);
    expect(state.counts.get(request.key)).toBe(0);

    const late = await adapter.consume({
      ...request,
      operationId: 'request-late',
    });
    if (!late.allowed) throw new Error('Expected late rate-limit reservation');
    state.windows.set(late.reservation.windowKey, 'newer-window');
    state.counts.set(request.key, 1);

    await expect(adapter.refund(late.reservation)).resolves.toBe(false);
    expect(state.counts.get(request.key)).toBe(1);
  });

  it('adds a window marker when consuming a key created by the legacy counter script', async () => {
    const { redis, state } = createAtomicRedis();
    const adapter = new RedisRateLimitAdapter(redis);
    const key = 'rate-limit:nearby:legacy-user';
    state.counts.set(key, 1);

    await expect(
      adapter.consume({ key, limit: 2, windowSeconds: 60 }),
    ).resolves.toMatchObject({ allowed: true });
    expect(state.windows.get(`${key}:rate-limit-window`)).toBeDefined();
  });

  it('fails fast when Redis is unavailable instead of guessing quota state', async () => {
    const redis = {
      eval: jest.fn().mockRejectedValue(new Error('Redis unavailable')),
    } as unknown as Redis;
    const adapter = new RedisRateLimitAdapter(redis);

    await expect(
      adapter.consume({
        key: 'rate-limit:nearby:user-1',
        limit: 1,
        windowSeconds: 60,
      }),
    ).rejects.toThrow('Redis unavailable');
  });
});
