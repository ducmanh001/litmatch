import type { Meter } from '@opentelemetry/api';

import { CallingMetrics } from './calling.metrics';

describe('CallingMetrics', () => {
  function makeMeter() {
    const counter = { add: jest.fn() };
    const meter = {
      createCounter: jest.fn(() => counter),
    } as unknown as Meter;
    return { meter, counter };
  }

  it('recordEnded ghi counter theo reason để OTLP reader export định kỳ', () => {
    const { meter, counter } = makeMeter();
    const metrics = new CallingMetrics(meter);

    metrics.recordEnded('completed');
    metrics.recordEnded('completed');
    metrics.recordEnded('insufficient_balance');

    expect(counter.add).toHaveBeenNthCalledWith(1, 1, { reason: 'completed' });
    expect(counter.add).toHaveBeenNthCalledWith(3, 1, {
      reason: 'insufficient_balance',
    });
  });

  it('lỗi ghi metric (best-effort) không được throw ra caller', () => {
    const { meter, counter } = makeMeter();
    counter.add.mockImplementation(() => {
      throw new Error('boom');
    });
    const metrics = new CallingMetrics(meter);

    expect(() => metrics.recordEnded('completed')).not.toThrow();
  });
});
