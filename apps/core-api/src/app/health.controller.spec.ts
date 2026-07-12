import { HttpStatus } from '@nestjs/common';

import { HealthController } from './health.controller';

describe('HealthController', () => {
  const readiness = { check: jest.fn() };
  const response = { status: jest.fn() };

  beforeEach(() => jest.clearAllMocks());

  it('keeps liveness independent from dependencies', () => {
    const controller = new HealthController(readiness as never);

    expect(controller.live()).toEqual({
      status: 'ok',
      uptimeSeconds: expect.any(Number),
    });
    expect(readiness.check).not.toHaveBeenCalled();
  });

  it('returns 503 when a required dependency is unavailable', async () => {
    readiness.check.mockResolvedValue({
      status: 'unavailable',
      checks: { postgres: 'down', redis: 'up' },
    });
    const controller = new HealthController(readiness as never);

    await expect(controller.ready(response as never)).resolves.toEqual({
      status: 'unavailable',
      checks: { postgres: 'down', redis: 'up' },
    });
    expect(response.status).toHaveBeenCalledWith(
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  });
});
