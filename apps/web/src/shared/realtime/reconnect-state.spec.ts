import {
  markSocketReconnect,
  resetSocketReconnectState,
  shouldRefetchAfterOnlineReconnect,
} from './reconnect-state';

describe('reconnect recovery coordination', () => {
  afterEach(() => resetSocketReconnectState());

  it('lets React Query recover when only the browser comes online', () => {
    expect(shouldRefetchAfterOnlineReconnect(10_000)).toBe(true);
  });

  it('suppresses the overlapping online refetch after socket resync', () => {
    markSocketReconnect(10_000);

    expect(shouldRefetchAfterOnlineReconnect(10_001)).toBe(false);
    expect(shouldRefetchAfterOnlineReconnect(12_001)).toBe(true);
  });
});
