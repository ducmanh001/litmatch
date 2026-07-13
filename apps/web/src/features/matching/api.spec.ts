import { isPollingStatus } from './api';

describe('isPollingStatus', () => {
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
