import { FRIEND_MESSAGES_REFETCH_INTERVAL_MS } from './api';

describe('friend chat polling', () => {
  it('dùng fallback 5 giây khi message hook đang mount', () => {
    expect(FRIEND_MESSAGES_REFETCH_INTERVAL_MS).toBe(5_000);
  });
});
