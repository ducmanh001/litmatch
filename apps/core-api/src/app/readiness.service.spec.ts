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
