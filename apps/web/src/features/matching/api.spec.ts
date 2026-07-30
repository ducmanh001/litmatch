import { isPollingStatus, MATCHING_TICKET_REFETCH_INTERVAL_MS } from './api';

describe('isPollingStatus', () => {
  it('dùng fallback 10 giây vì realtime là kênh chính', () => {
    expect(MATCHING_TICKET_REFETCH_INTERVAL_MS).toBe(10_000);
  });

  it('poll tiếp khi queued hoặc matched', () => {
    expect(isPollingStatus('queued')).toBe(true);
    expect(isPollingStatus('matched')).toBe(true);
  });

  it('dừng poll ở trạng thái chốt/chuyển màn', () => {
    expect(isPollingStatus('confirmed')).toBe(false);
    expect(isPollingStatus('expired')).toBe(false);
    expect(isPollingStatus('cancelled')).toBe(false);
    expect(isPollingStatus(undefined)).toBe(false);
  });
});
