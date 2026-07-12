/**
 * Session token store dùng chung cho mọi frontend (docs/12 § 12.6): access token CHỈ ở
 * memory; refresh token qua storage cắm được (browser → localStorage, test → memory).
 * Đây là tầng hợp đồng auth, không phải UI — vì vậy sống ở api-client, không phải app.
 */

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
}

export interface RefreshTokenStorage {
  get(): string | null;
  set(value: string | null): void;
  /** Browser adapter báo thay đổi từ tab khác; memory/test adapter không cần implement. */
  subscribe?(listener: (value: string | null) => void): () => void;
  /** Đồng bộ cả cặp token mà không ghi access token xuống persistent storage. */
  publishSession?(session: AuthSession | null): void;
  subscribeSession?(
    listener: (session: AuthSession | null) => void,
  ): () => void;
}

export type SessionStatus = 'authenticated' | 'restorable' | 'unauthenticated';

export function memoryRefreshTokenStorage(): RefreshTokenStorage {
  let value: string | null = null;
  return {
    get: () => value,
    set: (next) => {
      value = next;
    },
  };
}

/**
 * localStorage adapter — SSR-safe: trước khi có `window` (Next server render) mọi thao tác
 * là no-op trả null, vì session chỉ tồn tại phía browser (docs/12 § 12.6).
 */
export function browserRefreshTokenStorage(
  storageKey: string,
): RefreshTokenStorage {
  const available = (): boolean => typeof window !== 'undefined';
  let broadcastChannel: BroadcastChannel | null = null;
  const channel = (): BroadcastChannel | null => {
    if (!available() || typeof BroadcastChannel === 'undefined') return null;
    broadcastChannel ??= new BroadcastChannel(`${storageKey}.session`);
    return broadcastChannel;
  };
  return {
    get: () => (available() ? window.localStorage.getItem(storageKey) : null),
    set: (next) => {
      if (!available()) return;
      if (next === null) window.localStorage.removeItem(storageKey);
      else window.localStorage.setItem(storageKey, next);
    },
    subscribe: (listener) => {
      if (!available()) return () => undefined;
      const onStorage = (event: StorageEvent): void => {
        if (
          event.storageArea === window.localStorage &&
          event.key === storageKey
        ) {
          listener(event.newValue);
        }
      };
      window.addEventListener('storage', onStorage);
      return () => window.removeEventListener('storage', onStorage);
    },
    publishSession: (session) => channel()?.postMessage(session),
    subscribeSession: (listener) => {
      const target = channel();
      if (target === null) return () => undefined;
      const onMessage = (event: MessageEvent<unknown>): void => {
        const value = event.data;
        if (value === null) {
          listener(null);
          return;
        }
        if (
          typeof value === 'object' &&
          value !== null &&
          'accessToken' in value &&
          typeof value.accessToken === 'string' &&
          'refreshToken' in value &&
          typeof value.refreshToken === 'string'
        ) {
          listener({
            accessToken: value.accessToken,
            refreshToken: value.refreshToken,
          });
        }
      };
      target.addEventListener('message', onMessage);
      return () => target.removeEventListener('message', onMessage);
    },
  };
}

export interface TokenStore {
  getAccessToken(): string | null;
  getRefreshToken(): string | null;
  getStatus(): SessionStatus;
  getGeneration(): number;
  /** Ghi cả cặp token sau login/refresh; `null` = logout (xoá sạch). */
  setSession(session: AuthSession | null): void;
  /** Commit response async chỉ khi chưa có logout/rotation khác chen vào. */
  setSessionIfCurrent(
    session: AuthSession,
    expectedGeneration: number,
  ): boolean;
  /** Còn refresh token = còn khả năng khôi phục phiên (access hết hạn thì rotation lo). */
  isAuthenticated(): boolean;
  /** Cho UI (useSyncExternalStore/Zustand) phản ứng login/logout — trả hàm unsubscribe. */
  subscribe(listener: () => void): () => void;
}

export function createTokenStore(
  refreshStorage: RefreshTokenStorage,
): TokenStore {
  let accessToken: string | null = null;
  let accessRefreshToken: string | null = null;
  let generation = 0;
  const listeners = new Set<() => void>();
  const notify = (): void => listeners.forEach((fn) => fn());
  const status = (): SessionStatus => {
    if (accessToken !== null) return 'authenticated';
    return refreshStorage.get() !== null ? 'restorable' : 'unauthenticated';
  };

  refreshStorage.subscribe?.((storedRefreshToken) => {
    // Broadcast có thể tới trước storage event; đừng xóa access token vừa nhận cùng generation.
    if (storedRefreshToken === accessRefreshToken) return;
    generation += 1;
    accessToken = null;
    accessRefreshToken = null;
    notify();
  });
  refreshStorage.subscribeSession?.((session) => {
    generation += 1;
    accessToken = session?.accessToken ?? null;
    accessRefreshToken = session?.refreshToken ?? null;
    if (refreshStorage.get() !== accessRefreshToken) {
      refreshStorage.set(accessRefreshToken);
    }
    notify();
  });

  const setSession = (session: AuthSession | null): void => {
    generation += 1;
    accessToken = session?.accessToken ?? null;
    accessRefreshToken = session?.refreshToken ?? null;
    refreshStorage.set(accessRefreshToken);
    refreshStorage.publishSession?.(session);
    notify();
  };

  return {
    getAccessToken: () => accessToken,
    getRefreshToken: () => refreshStorage.get(),
    getStatus: status,
    getGeneration: () => generation,
    setSession,
    setSessionIfCurrent(session, expectedGeneration) {
      if (generation !== expectedGeneration) return false;
      setSession(session);
      return true;
    },
    isAuthenticated: () => status() !== 'unauthenticated',
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
