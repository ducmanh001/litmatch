import { HttpStatus } from '@nestjs/common';

import { HealthController } from './health.controller';

import type { Response } from 'express';
import type { SignalingRedisAdapterService } from './redis-adapter.service';
import type { SignalingGateway } from './signaling.gateway';

describe('HealthController readiness', () => {
  it.each([
    [true, true, 'ok', undefined],
    [false, true, 'unavailable', HttpStatus.SERVICE_UNAVAILABLE],
    [true, false, 'unavailable', HttpStatus.SERVICE_UNAVAILABLE],
    [false, false, 'unavailable', HttpStatus.SERVICE_UNAVAILABLE],
  ] as const)(
    'fanout=%s, clusterAdapter=%s → %s',
    (fanoutReady, adapterReady, status, httpStatus) => {
      const signaling = { isReady: () => fanoutReady } as SignalingGateway;
      const redisAdapter = {
        isReady: () => adapterReady,
      } as SignalingRedisAdapterService;
      const response = { status: jest.fn() } as unknown as Response;
      const result = new HealthController(signaling, redisAdapter).ready(
        response,
      );

      expect(result.status).toBe(status);
      expect(result.checks.redisSubscription).toBe(fanoutReady ? 'up' : 'down');
      expect(result.checks.redisClusterAdapter).toBe(
        adapterReady ? 'up' : 'down',
      );
      if (httpStatus === undefined)
        expect(response.status).not.toHaveBeenCalled();
      else expect(response.status).toHaveBeenCalledWith(httpStatus);
    },
  );
});
