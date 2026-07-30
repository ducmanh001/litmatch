import { isActiveCallStatus, VOICE_CALL_REFETCH_INTERVAL_MS } from './api';

describe('isActiveCallStatus', () => {
  it('dùng fallback 10 giây vì realtime là kênh chính', () => {
    expect(VOICE_CALL_REFETCH_INTERVAL_MS).toBe(10_000);
  });

  it('poll tiếp khi pending hoặc active', () => {
    expect(isActiveCallStatus('pending')).toBe(true);
    expect(isActiveCallStatus('active')).toBe(true);
  });

  it('dừng poll khi ended hoặc chưa có data', () => {
    expect(isActiveCallStatus('ended')).toBe(false);
    expect(isActiveCallStatus(undefined)).toBe(false);
  });
});
