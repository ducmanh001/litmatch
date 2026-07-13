import { ShieldOff } from 'lucide-react';

import { apiClient, tokenStore } from '../api/client';
import { Button } from '../ui/button';

/** Tài khoản end-user (role `user`) đăng nhập nhầm vào admin — UX only, backend đã tự chặn thật. */
export function NotStaffState() {
  const logout = async (): Promise<void> => {
    const csrfToken = tokenStore.getCsrfToken();
    tokenStore.setSession(null);
    if (csrfToken !== null) {
      await apiClient
        .POST('/api/v1/auth/logout', {
          credentials: 'include',
          headers: { 'x-csrf-token': csrfToken },
        })
        .catch(() => undefined);
    }
  };

  return (
    <div
      role="alert"
      className="flex min-h-screen flex-col items-center justify-center gap-3 text-center"
    >
      <ShieldOff className="size-8 text-destructive" aria-hidden />
      <p className="font-medium">Tài khoản này không có quyền truy cập admin</p>
      <p className="text-sm text-muted-foreground">
        Đăng nhập bằng tài khoản moderator/admin để tiếp tục.
      </p>
      <Button variant="ghost" onClick={() => void logout()}>
        Đăng xuất
      </Button>
    </div>
  );
}
