import {
  isPollingMovieAnonState,
  MOVIE_ANON_CURRENT_REFETCH_INTERVAL_MS,
  MOVIE_ANON_MESSAGES_REFETCH_INTERVAL_MS,
} from './anon-api';

describe('anonymous movie polling', () => {
  it('dùng fallback 5 giây cho current state và messages', () => {
    expect(MOVIE_ANON_CURRENT_REFETCH_INTERVAL_MS).toBe(5_000);
    expect(MOVIE_ANON_MESSAGES_REFETCH_INTERVAL_MS).toBe(5_000);
    expect(isPollingMovieAnonState('queued')).toBe(true);
    expect(isPollingMovieAnonState('watching')).toBe(true);
    expect(isPollingMovieAnonState('rating')).toBe(true);
  });

  it('dừng current-state poll ở trạng thái terminal hoặc chưa có data', () => {
    expect(isPollingMovieAnonState('idle')).toBe(false);
    expect(isPollingMovieAnonState('completed')).toBe(false);
    expect(isPollingMovieAnonState(undefined)).toBe(false);
  });
});
