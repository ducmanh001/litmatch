import { useMutation } from '@tanstack/react-query';
import {
  Gem,
  Gift,
  LayoutDashboard,
  LogOut,
  ShieldAlert,
  Users,
} from 'lucide-react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';

import { apiClient, tokenStore } from '../shared/api/client';
import { cn } from '../shared/lib/cn';
import { Button } from '../shared/ui/button';

/**
 * Nav khai báo tại 1 chỗ — feature mới thêm dòng vào đây, route vào router.tsx.
 * Các mục chưa có route là placeholder cho GĐ tiếp (users, moderation, economy, gifts).
 */
const NAV_ITEMS = [
  { to: '/', label: 'Tổng quan', icon: LayoutDashboard, end: true },
  { to: '/users', label: 'Người dùng', icon: Users },
  { to: '/moderation', label: 'Kiểm duyệt', icon: ShieldAlert },
  { to: '/economy', label: 'Economy', icon: Gem },
  { to: '/gifts', label: 'Gift catalog', icon: Gift },
] as const;

export function AppShell() {
  const navigate = useNavigate();

  const logout = useMutation({
    mutationFn: async () => {
      const csrfToken = tokenStore.getCsrfToken();
      tokenStore.setSession(null);
      navigate('/login', { replace: true });
      if (csrfToken !== null) {
        // Local logout thắng mọi response refresh cũ; revoke server (xoá cookie refresh_token
        // httpOnly qua CsrfGuard, ADR 0007) chạy best-effort sau đó.
        await apiClient
          .POST('/api/v1/auth/logout', {
            credentials: 'include',
            headers: { 'x-csrf-token': csrfToken },
          })
          .catch(() => undefined);
      }
    },
  });

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 flex-col border-r border-border bg-card">
        <div className="flex h-14 items-center border-b border-border px-4 font-semibold">
          Litmatch Admin
        </div>
        <nav className="flex-1 space-y-1 p-2" aria-label="Điều hướng chính">
          {NAV_ITEMS.map(({ to, label, icon: Icon, ...rest }) => (
            <NavLink
              key={to}
              to={to}
              end={'end' in rest}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground',
                  isActive && 'bg-muted text-foreground',
                )
              }
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-border p-2">
          <Button
            variant="ghost"
            className="w-full justify-start text-muted-foreground"
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
          >
            <LogOut className="size-4" aria-hidden />
            Đăng xuất
          </Button>
        </div>
      </aside>
      <main className="flex-1 p-6">
        <Outlet />
      </main>
    </div>
  );
}
