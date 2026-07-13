/**
 * Session token store dùng chung cho mọi frontend (docs/12 § 12.6, ADR 0007): refresh token là
 * cookie httpOnly do core-api set — JS không bao giờ giữ/đọc/persist giá trị đó. Store này chỉ
 * giữ access token (memory-only, mất khi reload) + csrf token (persist ở storage cắm được —
 * browser → localStorage, test → memory) để lần refresh đầu tiên sau reload còn CSRF header
 * hợp lệ gửi kèm trong khi cookie httpOnly vẫn còn sống sót qua reload. Đây là tầng hợp đồng
 * auth, không phải UI — vì vậy sống ở api-client, không phải app.
 */

export interface AuthSession {
  accessToken: string;
  csrfToken: string;
}

export interface CsrfTokenStorage {
  get(): string | null;
  set(value: string | null): void;
  /** Browser adapter báo thay đổi từ tab khác; memory/test adapter không cần implement. */
  subscribe?(listener: (value: string | null) => void): () => void;
}

export type SessionStatus = 'authenticated' | 'restorable' | 'unauthenticated';

export function memoryCsrfTokenStorage(): CsrfTokenStorage {
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
export function browserCsrfTokenStorage(storageKey: string): CsrfTokenStorage {
  const available = (): boolean => typeof window !== 'undefined';
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
  };
}

export interface TokenStore {
  getAccessToken(): string | null;
  getCsrfToken(): string | null;
  getStatus(): SessionStatus;
  getGeneration(): number;
  /** Ghi session sau login/refresh thành công; `null` = logout/hết hạn (xoá sạch). */
  setSession(session: AuthSession | null): void;
  /** Commit response async chỉ khi chưa có logout/rotation khác chen vào. */
  setSessionIfCurrent(
    session: AuthSession,
    expectedGeneration: number,
  ): boolean;
  /** `restorable` hoặc `authenticated` — còn khả năng có phiên hợp lệ. */
  isAuthenticated(): boolean;
  /** Cho UI (useSyncExternalStore) phản ứng login/logout — trả hàm unsubscribe. */
  subscribe(listener: () => void): () => void;
}

export function createTokenStore(csrfStorage: CsrfTokenStorage): TokenStore {
  let accessToken: string | null = null;
  let csrfToken: string | null = csrfStorage.get();
  // Có csrfToken persisted từ trước → có thể vẫn còn cookie httpOnly hợp lệ, đáng thử refresh.
  // Không có → chưa từng đăng nhập trên browser này, khỏi tốn round-trip gọi thẳng unauthenticated.
  let status: SessionStatus =
    csrfToken !== null ? 'restorable' : 'unauthenticated';
  let generation = 0;
  const listeners = new Set<() => void>();
  const notify = (): void => listeners.forEach((fn) => fn());

  csrfStorage.subscribe?.((newValue) => {
    generation += 1;
    if (newValue === null) {
      // Tab khác logout — theo ngay, không đợi tự 401.
      accessToken = null;
      csrfToken = null;
      status = 'unauthenticated';
    } else {
      // Tab khác rotate — cập nhật csrfToken, KHÔNG đổi accessToken/status của tab này.
      csrfToken = newValue;
      // Trừ khi tab này đang unauthenticated: tab khác vừa login → đáng thử restore ở đây.
      if (status === 'unauthenticated') status = 'restorable';
    }
    notify();
  });

  const setSession = (session: AuthSession | null): void => {
    generation += 1;
    accessToken = session?.accessToken ?? null;
    csrfToken = session?.csrfToken ?? null;
    status = session === null ? 'unauthenticated' : 'authenticated';
    csrfStorage.set(csrfToken);
    notify();
  };

  return {
    getAccessToken: () => accessToken,
    getCsrfToken: () => csrfToken,
    getStatus: () => status,
    getGeneration: () => generation,
    setSession,
    setSessionIfCurrent(session, expectedGeneration) {
      if (generation !== expectedGeneration) return false;
      setSession(session);
      return true;
    },
    isAuthenticated: () => status !== 'unauthenticated',
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
