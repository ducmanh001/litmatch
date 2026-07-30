import { isPollingPalmMatchState, PALM_MATCH_REFETCH_INTERVAL_MS } from './api';

describe('palm match polling', () => {
  it('dùng fallback 5 giây khi phiên còn hoạt động', () => {
    expect(PALM_MATCH_REFETCH_INTERVAL_MS).toBe(5_000);
    expect(isPollingPalmMatchState('queued')).toBe(true);
    expect(isPollingPalmMatchState('active')).toBe(true);
  });

  it('dừng poll ở trạng thái terminal hoặc chưa có data', () => {
    expect(isPollingPalmMatchState('idle')).toBe(false);
    expect(isPollingPalmMatchState('completed')).toBe(false);
    expect(isPollingPalmMatchState(undefined)).toBe(false);
  });
});
