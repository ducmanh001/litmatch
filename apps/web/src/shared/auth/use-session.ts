'use client';

import { useSyncExternalStore } from 'react';

import { tokenStore } from '../api/client';

import type { SessionStatus } from '@litmatch/api-client';

/**
 * Trạng thái đăng nhập phản ứng theo TokenStore. Server snapshot luôn `false` (session chỉ
 * có ở browser) — component dùng hook này phải chịu được first render unauthenticated.
 */
export function useSessionStatus(): SessionStatus {
  return useSyncExternalStore(
    tokenStore.subscribe,
    tokenStore.getStatus,
    () => 'unauthenticated',
  );
}

export function useIsAuthenticated(): boolean {
  return useSessionStatus() === 'authenticated';
}
