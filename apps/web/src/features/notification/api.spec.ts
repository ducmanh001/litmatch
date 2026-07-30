import { UNREAD_NOTIFICATION_COUNT_REFETCH_INTERVAL_MS } from './api';

describe('notification polling', () => {
  it('dùng fallback 60 giây cho unread count', () => {
    expect(UNREAD_NOTIFICATION_COUNT_REFETCH_INTERVAL_MS).toBe(60_000);
  });
});
