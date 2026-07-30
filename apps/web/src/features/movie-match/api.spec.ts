import { isActiveSession, MOVIE_SESSION_REFETCH_INTERVAL_MS } from './api';

describe('friend movie session polling', () => {
  it('dùng fallback 10 giây khi session active', () => {
    expect(MOVIE_SESSION_REFETCH_INTERVAL_MS).toBe(10_000);
    expect(isActiveSession('active')).toBe(true);
  });

  it('dừng poll khi session terminal hoặc chưa có data', () => {
    expect(isActiveSession('ended')).toBe(false);
    expect(isActiveSession(undefined)).toBe(false);
  });
});
