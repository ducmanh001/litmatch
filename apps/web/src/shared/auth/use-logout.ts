'use client';

import { useRouter } from 'next/navigation';

import { apiClient, tokenStore } from '../api/client';
import { disconnectRealtime } from '../realtime/socket';

/**
 * Logic đăng xuất dùng chung (local logout thắng response refresh cũ, revoke server best-effort
 * sau đó — ADR 0007). 1 chỗ khai duy nhất để AppChrome (nav) và menu Hồ sơ không lặp lại CSRF
 * + session-clear.
 */
export function useLogout(): () => void {
  const router = useRouter();

  return () => {
    const csrfToken = tokenStore.getCsrfToken();
    disconnectRealtime();
    tokenStore.setSession(null);
    router.replace('/login');
    if (csrfToken !== null) {
      void apiClient
        .POST('/api/v1/auth/logout', {
          credentials: 'include',
          headers: { 'x-csrf-token': csrfToken },
        })
        .catch(() => undefined);
    }
  };
}
