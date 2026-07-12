import { createTokenStore, memoryRefreshTokenStorage } from './token-store';

import type { AuthSession } from './token-store';

describe('TokenStore session lifecycle', () => {
  it('phân biệt unauthenticated, authenticated và restorable sau reload', () => {
    const storage = memoryRefreshTokenStorage();
    const store = createTokenStore(storage);

    expect(store.getStatus()).toBe('unauthenticated');
    store.setSession({ accessToken: 'access', refreshToken: 'refresh' });
    expect(store.getStatus()).toBe('authenticated');

    const reloadedStore = createTokenStore(storage);
    expect(reloadedStore.getAccessToken()).toBeNull();
    expect(reloadedStore.getStatus()).toBe('restorable');

    reloadedStore.setSession(null);
    expect(reloadedStore.getStatus()).toBe('unauthenticated');
  });

  it('không commit response async nếu generation đã đổi', () => {
    const store = createTokenStore(memoryRefreshTokenStorage());
    store.setSession({ accessToken: 'old', refreshToken: 'refresh-old' });
    const expectedGeneration = store.getGeneration();

    store.setSession(null);
    const committed = store.setSessionIfCurrent(
      { accessToken: 'late', refreshToken: 'refresh-late' },
      expectedGeneration,
    );

    expect(committed).toBe(false);
    expect(store.getStatus()).toBe('unauthenticated');
  });

  it('nhận session rotation từ tab khác mà không persist access token', () => {
    let sessionListener: ((session: AuthSession | null) => void) | undefined;
    let refreshToken: string | null = 'refresh-old';
    const store = createTokenStore({
      get: () => refreshToken,
      set: (value) => {
        refreshToken = value;
      },
      subscribeSession: (listener) => {
        sessionListener = listener;
        return () => undefined;
      },
    });

    sessionListener?.({
      accessToken: 'access-new',
      refreshToken: 'refresh-new',
    });

    expect(store.getAccessToken()).toBe('access-new');
    expect(store.getRefreshToken()).toBe('refresh-new');
    expect(store.getStatus()).toBe('authenticated');
  });
});
