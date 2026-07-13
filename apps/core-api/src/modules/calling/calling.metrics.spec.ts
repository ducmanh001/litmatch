import { Registry } from 'prom-client';

import { CallingMetrics } from './calling.metrics';

describe('CallingMetrics', () => {
  it('recordEnded cộng dồn call_ended_total theo reason', async () => {
    const registry = new Registry();
    const metrics = new CallingMetrics(registry);

    metrics.recordEnded('completed');
    metrics.recordEnded('completed');
    metrics.recordEnded('insufficient_balance');

    const text = await registry.metrics();
    expect(text).toContain('call_ended_total{reason="completed"} 2');
    expect(text).toContain('call_ended_total{reason="insufficient_balance"} 1');
  });

  it('lỗi ghi metric (best-effort) không được throw ra caller — không được chặn dọn room SFU (endById → cleanupEndedCall)', () => {
    const registry = new Registry();
    const metrics = new CallingMetrics(registry);
    const counter = (
      metrics as unknown as { callEndedTotal: { inc: () => void } }
    ).callEndedTotal;
    jest.spyOn(counter, 'inc').mockImplementation(() => {
      throw new Error('boom');
    });

    expect(() => metrics.recordEnded('completed')).not.toThrow();
  });
});
