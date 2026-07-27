import type { Meter } from '@opentelemetry/api';

import { MatchingMetrics } from './matching.metrics';

describe('MatchingMetrics', () => {
  function makeMeter() {
    const histogram = { record: jest.fn() };
    const meter = {
      createHistogram: jest.fn(() => histogram),
    } as unknown as Meter;
    return { meter, histogram };
  }

  it('observeMatched ghi histogram theo matchType để OTLP reader export định kỳ', () => {
    const { meter, histogram } = makeMeter();
    const metrics = new MatchingMetrics(meter);

    metrics.observeMatched('voice', 3.4);
    metrics.observeMatched('soul', 12);

    expect(histogram.record).toHaveBeenNthCalledWith(1, 3.4, {
      matchType: 'voice',
    });
    expect(histogram.record).toHaveBeenNthCalledWith(2, 12, {
      matchType: 'soul',
    });
  });

  it('wait âm (đồng hồ lệch) → clamp về 0', () => {
    const { meter, histogram } = makeMeter();
    const metrics = new MatchingMetrics(meter);

    metrics.observeMatched('voice', -5);

    expect(histogram.record).toHaveBeenCalledWith(0, { matchType: 'voice' });
  });

  it('lỗi ghi metric (best-effort) không được throw ra caller', () => {
    const { meter, histogram } = makeMeter();
    histogram.record.mockImplementation(() => {
      throw new Error('boom');
    });
    const metrics = new MatchingMetrics(meter);

    expect(() => metrics.observeMatched('voice', 1)).not.toThrow();
  });
});
