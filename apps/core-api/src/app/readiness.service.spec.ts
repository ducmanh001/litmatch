import { ReadinessService } from './readiness.service';

describe('ReadinessService', () => {
  const redis = {
    status: 'ready',
    on: jest.fn(),
    connect: jest.fn(),
    ping: jest.fn(),
    disconnect: jest.fn(),
  };
  const dataSource = { query: jest.fn() };
  const config = {
    getOrThrow: jest.fn().mockReturnValue('redis://localhost:6379'),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    dataSource.query.mockResolvedValue([{ '?column?': 1 }]);
    redis.ping.mockResolvedValue('PONG');
  });
  afterEach(() => jest.useRealTimers());

  function serviceWithStubs() {
    const service = new ReadinessService(dataSource as never, config as never);
    (service as unknown as { redis: typeof redis }).redis = redis;
    return service;
  }

  it('coalesces concurrent probes and caches results for one second', async () => {
    jest.useFakeTimers();
    const service = serviceWithStubs();
    const results = await Promise.all(
      Array.from({ length: 100 }, () => service.check()),
    );
    expect(results.every((result) => result.status === 'ok')).toBe(true);
    await service.check();
    expect(dataSource.query).toHaveBeenCalledTimes(1);
    expect(redis.ping).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1001);
    await service.check();
    expect(dataSource.query).toHaveBeenCalledTimes(2);
  });

  it('retains one pending SQL query across HTTP timeouts and recovers once it settles', async () => {
    jest.useFakeTimers();
    let release!: (value: unknown[]) => void;
    dataSource.query.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const service = serviceWithStubs();
    const first = service.check();
    await jest.advanceTimersByTimeAsync(1001);
    expect((await first).checks.postgres).toBe('down');
    await jest.advanceTimersByTimeAsync(1001);
    const second = service.check();
    await jest.advanceTimersByTimeAsync(1001);
    expect((await second).checks.postgres).toBe('down');
    expect(dataSource.query).toHaveBeenCalledTimes(1);
    release([]);
    await jest.advanceTimersByTimeAsync(1001);
    expect((await service.check()).status).toBe('ok');
    expect(dataSource.query).toHaveBeenCalledTimes(2);
  });

  it('is ready only when Postgres and Redis respond', async () => {
    const service = new ReadinessService(dataSource as never, config as never);
    (service as unknown as { redis: typeof redis }).redis = redis;

    await expect(service.check()).resolves.toEqual({
      status: 'ok',
      checks: { postgres: 'up', redis: 'up' },
    });
  });

  it('reports the failing dependency without leaking its error', async () => {
    dataSource.query.mockRejectedValue(new Error('password=must-not-leak'));
    const service = new ReadinessService(dataSource as never, config as never);
    (service as unknown as { redis: typeof redis }).redis = redis;

    await expect(service.check()).resolves.toEqual({
      status: 'unavailable',
      checks: { postgres: 'down', redis: 'up' },
    });
  });
});
