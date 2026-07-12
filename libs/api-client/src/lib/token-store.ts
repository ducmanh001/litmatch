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
}

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
  return {
    get: () => (available() ? window.localStorage.getItem(storageKey) : null),
    set: (next) => {
      if (!available()) return;
      if (next === null) window.localStorage.removeItem(storageKey);
      else window.localStorage.setItem(storageKey, next);
    },
  };
}

export interface TokenStore {
  getAccessToken(): string | null;
  getRefreshToken(): string | null;
  /** Ghi cả cặp token sau login/refresh; `null` = logout (xoá sạch). */
  setSession(session: AuthSession | null): void;
  /** Còn refresh token = còn khả năng khôi phục phiên (access hết hạn thì rotation lo). */
  isAuthenticated(): boolean;
  /** Cho UI (useSyncExternalStore/Zustand) phản ứng login/logout — trả hàm unsubscribe. */
  subscribe(listener: () => void): () => void;
}

export function createTokenStore(
  refreshStorage: RefreshTokenStorage,
): TokenStore {
  let accessToken: string | null = null;
  const listeners = new Set<() => void>();
  const notify = (): void => listeners.forEach((fn) => fn());

  return {
    getAccessToken: () => accessToken,
    getRefreshToken: () => refreshStorage.get(),
    setSession(session) {
      accessToken = session?.accessToken ?? null;
      refreshStorage.set(session?.refreshToken ?? null);
      notify();
    },
    isAuthenticated: () => refreshStorage.get() !== null,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
