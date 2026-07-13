import { Registry } from 'prom-client';

import { MatchingMetrics } from './matching.metrics';

describe('MatchingMetrics', () => {
  it('observeMatched ghi histogram matching_ticket_wait_seconds theo matchType', async () => {
    const registry = new Registry();
    const metrics = new MatchingMetrics(registry);

    metrics.observeMatched('voice', 3.4);
    metrics.observeMatched('soul', 12);

    const text = await registry.metrics();
    expect(text).toContain(
      'matching_ticket_wait_seconds_count{matchType="voice"} 1',
    );
    expect(text).toContain(
      'matching_ticket_wait_seconds_count{matchType="soul"} 1',
    );
  });

  it('wait âm (đồng hồ lệch) → clamp về 0, không ghi số âm', async () => {
    const registry = new Registry();
    const metrics = new MatchingMetrics(registry);

    metrics.observeMatched('voice', -5);

    const text = await registry.metrics();
    expect(text).toContain(
      'matching_ticket_wait_seconds_bucket{le="0.1",matchType="voice"} 1',
    );
  });

  it('lỗi ghi metric (best-effort) không được throw ra caller — không được chặn publish match.matched', () => {
    const registry = new Registry();
    const metrics = new MatchingMetrics(registry);
    const histogram = (
      metrics as unknown as { ticketWaitSeconds: { observe: () => void } }
    ).ticketWaitSeconds;
    jest.spyOn(histogram, 'observe').mockImplementation(() => {
      throw new Error('boom');
    });

    expect(() => metrics.observeMatched('voice', 1)).not.toThrow();
  });
});
