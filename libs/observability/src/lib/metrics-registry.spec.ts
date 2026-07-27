import { metrics } from '@opentelemetry/api';

import { createMetricsMeter } from './metrics-registry';

describe('createMetricsMeter', () => {
  afterEach(() => jest.restoreAllMocks());

  it('lấy Meter OTel và đăng ký heartbeat/process gauges', () => {
    const meter = {
      createObservableGauge: jest.fn(() => ({ addCallback: jest.fn() })),
    };
    jest.spyOn(metrics, 'getMeter').mockReturnValue(meter as never);

    expect(createMetricsMeter({ appName: 'core-api' })).toBe(meter);
    expect(meter.createObservableGauge).toHaveBeenCalledTimes(3);
    expect(meter.createObservableGauge).toHaveBeenNthCalledWith(
      1,
      'litmatch_up',
      expect.any(Object),
    );
  });
});
