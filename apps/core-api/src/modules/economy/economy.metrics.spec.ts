import type { Meter } from '@opentelemetry/api';

import { EconomyMetrics } from './economy.metrics';

describe('EconomyMetrics', () => {
  function makeMeter() {
    const transactionCounter = { add: jest.fn() };
    const mismatchCounter = { add: jest.fn() };
    const gauge = { addCallback: jest.fn() };
    const histogram = { record: jest.fn() };
    const meter = {
      createCounter: jest
        .fn()
        .mockReturnValueOnce(transactionCounter)
        .mockReturnValueOnce(mismatchCounter),
      createObservableGauge: jest.fn(() => gauge),
      createHistogram: jest.fn(() => histogram),
    } as unknown as Meter;
    return { meter, transactionCounter, mismatchCounter, gauge, histogram };
  }

  it('record ghi economy_transaction_total theo type + result', () => {
    const { meter, transactionCounter } = makeMeter();
    const metrics = new EconomyMetrics(meter);

    metrics.record('gift_send', 'success');
    metrics.record('gift_send', 'success');
    metrics.record('gift_send', 'failed');
    metrics.record('vip_purchase', 'replayed');

    expect(transactionCounter.add).toHaveBeenNthCalledWith(1, 1, {
      type: 'gift_send',
      result: 'success',
    });
    expect(transactionCounter.add).toHaveBeenNthCalledWith(4, 1, {
      type: 'vip_purchase',
      result: 'replayed',
    });
  });

  it('lỗi ghi metric best-effort không throw ra caller', () => {
    const { meter, transactionCounter } = makeMeter();
    transactionCounter.add.mockImplementation(() => {
      throw new Error('boom');
    });
    const metrics = new EconomyMetrics(meter);

    expect(() => metrics.record('gift_send', 'success')).not.toThrow();
  });

  it('recordReconciliationMismatch bỏ qua count=0', () => {
    const { meter, mismatchCounter } = makeMeter();
    const metrics = new EconomyMetrics(meter);

    metrics.recordReconciliationMismatch('invariant', 'DIA');
    metrics.recordReconciliationMismatch('orphan_receipt', 'DIA', 3);
    metrics.recordReconciliationMismatch('wallet_sample', 'DIA', 0);

    expect(mismatchCounter.add).toHaveBeenNthCalledWith(1, 1, {
      check: 'invariant',
      currency: 'DIA',
    });
    expect(mismatchCounter.add).toHaveBeenNthCalledWith(2, 3, {
      check: 'orphan_receipt',
      currency: 'DIA',
    });
    expect(mismatchCounter.add).toHaveBeenCalledTimes(2);
  });

  it('recordReconciliationRun cập nhật status callback và duration', () => {
    const { meter, gauge, histogram } = makeMeter();
    const metrics = new EconomyMetrics(meter);

    metrics.recordReconciliationRun('fast', true, 0.12);
    metrics.recordReconciliationRun('deep', false);

    expect(gauge.addCallback).toHaveBeenCalledTimes(1);
    expect(histogram.record).toHaveBeenCalledWith(0.12, { tier: 'fast' });
    expect(
      (
        metrics as unknown as {
          reconciliationStatusByTier: Map<string, number>;
        }
      ).reconciliationStatusByTier,
    ).toEqual(
      new Map([
        ['fast', 1],
        ['deep', 0],
      ]),
    );
  });

  it('lỗi ghi metric đối soát best-effort không throw ra job', () => {
    const { meter, mismatchCounter, histogram } = makeMeter();
    mismatchCounter.add.mockImplementation(() => {
      throw new Error('boom');
    });
    histogram.record.mockImplementation(() => {
      throw new Error('boom');
    });
    const metrics = new EconomyMetrics(meter);

    expect(() =>
      metrics.recordReconciliationMismatch('invariant', 'DIA'),
    ).not.toThrow();
    expect(() =>
      metrics.recordReconciliationRun('fast', true, 1),
    ).not.toThrow();
  });
});
