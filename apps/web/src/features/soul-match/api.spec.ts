import {
  isOpenPhase,
  SOUL_MESSAGES_REFETCH_INTERVAL_MS,
  SOUL_SESSION_REFETCH_INTERVAL_MS,
} from './api';

describe('isOpenPhase', () => {
  it('dùng fallback 10 giây cho session và 5 giây cho messages', () => {
    expect(SOUL_SESSION_REFETCH_INTERVAL_MS).toBe(10_000);
    expect(SOUL_MESSAGES_REFETCH_INTERVAL_MS).toBe(5_000);
  });

  it('poll tiếp khi chatting hoặc rating', () => {
    expect(isOpenPhase('chatting')).toBe(true);
    expect(isOpenPhase('rating')).toBe(true);
  });

  it('dừng poll khi closed hoặc chưa có data', () => {
    expect(isOpenPhase('closed')).toBe(false);
    expect(isOpenPhase(undefined)).toBe(false);
  });
});
