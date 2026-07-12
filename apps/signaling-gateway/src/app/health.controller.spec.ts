import { HttpStatus } from '@nestjs/common';

import { HealthController } from './health.controller';

import type { Response } from 'express';
import type { SignalingGateway } from './signaling.gateway';

describe('HealthController readiness', () => {
  it.each([
    [true, 'ok', undefined],
    [false, 'unavailable', HttpStatus.SERVICE_UNAVAILABLE],
  ] as const)('Redis subscription=%s → %s', (ready, status, httpStatus) => {
    const signaling = { isReady: () => ready } as SignalingGateway;
    const response = { status: jest.fn() } as unknown as Response;
    const result = new HealthController(signaling).ready(response);

    expect(result.status).toBe(status);
    expect(result.checks.redisSubscription).toBe(ready ? 'up' : 'down');
    if (httpStatus === undefined)
      expect(response.status).not.toHaveBeenCalled();
    else expect(response.status).toHaveBeenCalledWith(httpStatus);
  });
});
