import { useSyncExternalStore } from 'react';

import { tokenStore } from '../api/client';

import type { SessionStatus } from '@litmatch/api-client';

export function useSessionStatus(): SessionStatus {
  return useSyncExternalStore(
    tokenStore.subscribe,
    tokenStore.getStatus,
    () => 'unauthenticated',
  );
}

/** Trạng thái đăng nhập phản ứng theo TokenStore — login/logout/refresh-fail đều cập nhật UI. */
export function useIsAuthenticated(): boolean {
  return useSessionStatus() === 'authenticated';
}
