import { Registry } from 'prom-client';

import { EconomyMetrics } from './economy.metrics';

describe('EconomyMetrics', () => {
  it('record cộng dồn economy_transaction_total theo type + result', async () => {
    const registry = new Registry();
    const metrics = new EconomyMetrics(registry);

    metrics.record('gift_send', 'success');
    metrics.record('gift_send', 'success');
    metrics.record('gift_send', 'failed');
    metrics.record('vip_purchase', 'replayed');

    const text = await registry.metrics();
    expect(text).toContain(
      'economy_transaction_total{type="gift_send",result="success"} 2',
    );
    expect(text).toContain(
      'economy_transaction_total{type="gift_send",result="failed"} 1',
    );
    expect(text).toContain(
      'economy_transaction_total{type="vip_purchase",result="replayed"} 1',
    );
  });

  it('lỗi ghi metric (best-effort) không được throw ra caller — không được chặn giao dịch đã ghi sổ xong', () => {
    const registry = new Registry();
    const metrics = new EconomyMetrics(registry);
    const counter = (
      metrics as unknown as { transactionsTotal: { inc: () => void } }
    ).transactionsTotal;
    jest.spyOn(counter, 'inc').mockImplementation(() => {
      throw new Error('boom');
    });

    expect(() => metrics.record('gift_send', 'success')).not.toThrow();
  });

  it('recordReconciliationMismatch cộng theo check + currency; count=0 không tạo series rác', async () => {
    const registry = new Registry();
    const metrics = new EconomyMetrics(registry);

    metrics.recordReconciliationMismatch('invariant', 'DIA');
    metrics.recordReconciliationMismatch('orphan_receipt', 'DIA', 3);
    metrics.recordReconciliationMismatch('wallet_sample', 'DIA', 0);

    const text = await registry.metrics();
    expect(text).toContain(
      'economy_reconciliation_mismatch_total{check="invariant",currency="DIA"} 1',
    );
    expect(text).toContain(
      'economy_reconciliation_mismatch_total{check="orphan_receipt",currency="DIA"} 3',
    );
    expect(text).not.toContain('check="wallet_sample"');
  });

  it('recordReconciliationRun set gauge status theo tier + observe duration; run lỗi bỏ qua duration', async () => {
    const registry = new Registry();
    const metrics = new EconomyMetrics(registry);

    metrics.recordReconciliationRun('fast', true, 0.12);
    metrics.recordReconciliationRun('deep', false); // run lỗi: không có duration

    const text = await registry.metrics();
    expect(text).toContain(
      'economy_reconciliation_last_run_status{tier="fast"} 1',
    );
    expect(text).toContain(
      'economy_reconciliation_last_run_status{tier="deep"} 0',
    );
    expect(text).toContain(
      'economy_reconciliation_run_duration_seconds_count{tier="fast"} 1',
    );
    expect(text).not.toContain(
      'economy_reconciliation_run_duration_seconds_count{tier="deep"}',
    );
  });

  it('lỗi ghi metric đối soát (best-effort) không throw ra job — không được che mất log lệch', () => {
    const registry = new Registry();
    const metrics = new EconomyMetrics(registry);
    const internals = metrics as unknown as {
      reconciliationMismatchTotal: { inc: () => void };
      reconciliationLastRunStatus: { set: () => void };
    };
    jest
      .spyOn(internals.reconciliationMismatchTotal, 'inc')
      .mockImplementation(() => {
        throw new Error('boom');
      });
    jest
      .spyOn(internals.reconciliationLastRunStatus, 'set')
      .mockImplementation(() => {
        throw new Error('boom');
      });

    expect(() =>
      metrics.recordReconciliationMismatch('invariant', 'DIA'),
    ).not.toThrow();
    expect(() =>
      metrics.recordReconciliationRun('fast', true, 1),
    ).not.toThrow();
  });
});
