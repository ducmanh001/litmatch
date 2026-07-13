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
});
