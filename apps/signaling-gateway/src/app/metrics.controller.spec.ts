import { Registry } from 'prom-client';

import { MetricsController } from './metrics.controller';

import type { Response } from 'express';

describe('MetricsController', () => {
  it('trả text Prometheus + set đúng Content-Type của registry', async () => {
    const registry = new Registry();
    registry.setDefaultLabels({ app: 'signaling-gateway' });
    const controller = new MetricsController(registry);
    const setHeader = jest.fn();
    const response = { setHeader } as unknown as Response;

    const body = await controller.metrics(response);

    expect(setHeader).toHaveBeenCalledWith(
      'Content-Type',
      registry.contentType,
    );
    expect(body).toEqual(await registry.metrics());
  });
});
