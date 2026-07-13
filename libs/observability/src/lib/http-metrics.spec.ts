import { EventEmitter } from 'node:events';

import { Registry } from 'prom-client';

import { createHttpMetricsMiddleware } from './http-metrics';

import type { NextFunction, Request, Response } from 'express';

function fakeRes(statusCode: number): Response & EventEmitter {
  const res = new EventEmitter() as Response & EventEmitter;
  (res as unknown as { statusCode: number }).statusCode = statusCode;
  return res;
}

describe('createHttpMetricsMiddleware', () => {
  it('quan sát http_request_duration_seconds với route/method/status_code khi response finish', async () => {
    const registry = new Registry();
    const middleware = createHttpMetricsMiddleware(registry);
    const req = {
      method: 'GET',
      route: { path: '/matching/tickets/:id' },
    } as unknown as Request;
    const res = fakeRes(200);
    const next = jest.fn() as NextFunction;

    middleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    res.emit('finish');

    const text = await registry.metrics();
    expect(text).toContain(
      'method="GET",route="/matching/tickets/:id",status_code="200"',
    );
  });

  it('route chưa resolve (vd 404) → nhãn route="unmatched"', async () => {
    const registry = new Registry();
    const middleware = createHttpMetricsMiddleware(registry);
    const req = { method: 'GET' } as unknown as Request;
    const res = fakeRes(404);

    middleware(req, res, jest.fn());
    res.emit('finish');

    const text = await registry.metrics();
    expect(text).toContain('route="unmatched",status_code="404"');
  });
});
