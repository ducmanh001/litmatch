import { useSyncExternalStore } from 'react';

import { tokenStore } from '../api/client';

/** Trạng thái đăng nhập phản ứng theo TokenStore — login/logout/refresh-fail đều cập nhật UI. */
export function useIsAuthenticated(): boolean {
  return useSyncExternalStore(
    tokenStore.subscribe,
    tokenStore.isAuthenticated,
    () => false,
  );
}
