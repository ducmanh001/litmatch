'use client';

import { useSyncExternalStore } from 'react';

import { tokenStore } from '../api/client';

/**
 * Trạng thái đăng nhập phản ứng theo TokenStore. Server snapshot luôn `false` (session chỉ
 * có ở browser) — component dùng hook này phải chịu được first render unauthenticated.
 */
export function useIsAuthenticated(): boolean {
  return useSyncExternalStore(
    tokenStore.subscribe,
    tokenStore.isAuthenticated,
    () => false,
  );
}
