import type { Meter } from '@opentelemetry/api';

import { createHttpMetricsMiddleware } from './http-metrics';

describe('createHttpMetricsMiddleware', () => {
  it('ghi duration theo method/route/status_code vào OTel histogram', () => {
    const histogram = { record: jest.fn() };
    const meter = {
      createHistogram: jest.fn(() => histogram),
    } as unknown as Meter;
    const middleware = createHttpMetricsMiddleware(meter);
    const finishHandlers: Array<() => void> = [];
    const response = {
      statusCode: 201,
      on: jest.fn((_event: string, handler: () => void) => {
        finishHandlers.push(handler);
      }),
    };
    const next = jest.fn();

    middleware(
      { method: 'GET', route: { path: '/users/:id' } } as never,
      response as never,
      next,
    );
    finishHandlers[0]();

    expect(next).toHaveBeenCalledTimes(1);
    expect(histogram.record).toHaveBeenCalledWith(expect.any(Number), {
      method: 'GET',
      route: '/users/:id',
      status_code: '201',
    });
  });

  it('fallback route unmatched khi Express chưa resolve route', () => {
    const histogram = { record: jest.fn() };
    const meter = {
      createHistogram: jest.fn(() => histogram),
    } as unknown as Meter;
    const middleware = createHttpMetricsMiddleware(meter);
    let finish: (() => void) | undefined;

    middleware(
      { method: 'GET' } as never,
      {
        statusCode: 404,
        on: jest.fn((_event: string, handler: () => void) => {
          finish = handler;
        }),
      } as never,
      jest.fn(),
    );
    finish?.();

    expect(histogram.record).toHaveBeenCalledWith(expect.any(Number), {
      method: 'GET',
      route: 'unmatched',
      status_code: '404',
    });
  });
});
