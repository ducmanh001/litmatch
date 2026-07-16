import { useMutation } from '@tanstack/react-query';
import {
  Bell,
  Gem,
  Gift,
  LayoutDashboard,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Radio,
  Search,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';

import { useReportsList } from '../features/moderation/api';
import { apiClient, tokenStore } from '../shared/api/client';
import { useRole } from '../shared/auth/use-role';
import { cn } from '../shared/lib/cn';
import { Button } from '../shared/ui/button';
import { ThemeSlider } from '../shared/ui/theme-slider';
import { ToastStack } from '../shared/ui/toast-stack';

/**
 * Nav khai báo tại 1 chỗ — feature mới thêm dòng vào đây, route vào router.tsx.
 * Thứ tự + icon khớp layouts/admins/litmatch-admin-dashboard (2).html.
 */
const NAV_ITEMS = [
  { to: '/', label: 'Tổng quan', icon: LayoutDashboard, end: true },
  { to: '/users', label: 'Quản lý người dùng', icon: Users },
  { to: '/moderation', label: 'Kiểm duyệt & báo cáo', icon: ShieldAlert },
  { to: '/economy', label: 'Giao dịch & Diamond', icon: Gem },
  { to: '/gifts', label: 'Quà tặng', icon: Gift },
  { to: '/rooms', label: 'Party Room', icon: Radio },
  { to: '/config', label: 'Cấu hình gói/Thông báo', icon: SlidersHorizontal },
  { to: '/permissions', label: 'Phân quyền admin', icon: ShieldCheck },
] as const;

const PAGE_META: Record<string, { title: string; subtitle: string }> = {
  '/': {
    title: 'Tổng quan',
    subtitle: 'Số liệu vận hành, Economy và audit log theo thời gian thực',
  },
  '/users': {
    title: 'Quản lý người dùng',
    subtitle: 'Danh sách toàn bộ tài khoản',
  },
  '/moderation': {
    title: 'Kiểm duyệt & báo cáo',
    subtitle: 'Báo cáo người dùng + video ngắn chờ duyệt',
  },
  '/economy': {
    title: 'Giao dịch & Diamond',
    subtitle: 'Tra cứu ví và lịch sử giao dịch theo user',
  },
  '/gifts': {
    title: 'Quà tặng',
    subtitle: 'Gift catalog — quản lý danh mục quà tặng',
  },
  '/rooms': { title: 'Party Room', subtitle: 'Danh sách phòng đang hoạt động' },
  '/config': {
    title: 'Cấu hình gói & thông báo',
    subtitle: 'Catalog Economy và thông báo toàn hệ thống',
  },
  '/permissions': {
    title: 'Phân quyền admin',
    subtitle: 'Policy backend và vai trò nhân sự đang có hiệu lực',
  },
};

const ROLE_LABEL: Record<string, { initials: string; label: string }> = {
  admin: { initials: 'AD', label: 'Quản trị viên' },
  moderator: { initials: 'MO', label: 'Kiểm duyệt viên' },
  user: { initials: 'U', label: 'Người dùng' },
};

export function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const role = useRole();
  const pendingReports = useReportsList('pending', 0);
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);

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

  const pageMeta = PAGE_META[location.pathname] ?? PAGE_META['/'];
  const roleInfo = (role !== null ? ROLE_LABEL[role] : undefined) ?? {
    initials: '?',
    label: 'Đang tải…',
  };
  return (
    <div className="flex min-h-screen w-full bg-page">
      <div className="flex min-h-screen w-full bg-background">
        <div className="relative sticky top-0 h-screen w-[74px] shrink-0 self-start">
          <aside
            aria-label={
              isSidebarExpanded ? 'Menu đang mở rộng' : 'Menu đang thu gọn'
            }
            className={cn(
              'absolute inset-y-0 left-0 z-40 flex w-[74px] flex-col gap-3 overflow-x-hidden overflow-y-auto border-r border-border bg-muted py-[22px] transition-[width,padding,box-shadow] duration-200 ease-out',
              isSidebarExpanded
                ? 'w-[272px] items-stretch px-3 shadow-[18px_0_40px_rgb(0_0_0/28%)]'
                : 'items-center',
            )}
          >
            <div
              className={cn(
                'mb-2 flex h-[38px] shrink-0 items-center',
                isSidebarExpanded ? 'w-full gap-3 px-1' : 'justify-center',
              )}
            >
              <div className="flex size-[38px] shrink-0 items-center justify-center rounded-[11px] bg-primary text-brand-foreground">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-[19px]"
                  aria-hidden
                >
                  <path d="M6 3h12l3 5-9 13L3 8Z" />
                  <path d="M3 8h18M9 3l3 5 3-5M12 8l-3 13M12 8l3 13" />
                </svg>
              </div>
              {isSidebarExpanded && (
                <span className="truncate text-sm font-extrabold">
                  Litmatch Admin
                </span>
              )}
              {isSidebarExpanded && (
                <button
                  type="button"
                  aria-expanded
                  aria-label="Thu gọn menu"
                  title="Thu gọn menu"
                  onClick={() => setIsSidebarExpanded(false)}
                  className="ml-auto flex size-[38px] shrink-0 items-center justify-center rounded-[11px] border border-border bg-card text-muted-foreground transition-colors hover:border-primary hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  <PanelLeftClose className="size-[18px]" aria-hidden />
                </button>
              )}
            </div>
            <nav
              className={cn(
                'flex flex-col gap-2.5',
                isSidebarExpanded && 'w-full',
              )}
              aria-label="Điều hướng chính"
            >
              {NAV_ITEMS.map(({ to, label, icon: Icon, ...rest }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={'end' in rest}
                  className={({ isActive }) =>
                    cn(
                      'nav-item-tip-trigger relative flex h-[42px] shrink-0 items-center rounded-xl text-muted-foreground transition-colors hover:bg-card hover:text-foreground',
                      isSidebarExpanded
                        ? 'w-full justify-start gap-3 px-3'
                        : 'w-[42px] justify-center',
                      isActive && 'bg-primary-soft text-primary',
                    )
                  }
                >
                  <Icon className="size-[19px]" aria-hidden />
                  {to === '/moderation' &&
                    pendingReports.data !== undefined &&
                    pendingReports.data.total > 0 && (
                      <span
                        className={cn(
                          'absolute flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-[3px] text-[9px] font-extrabold text-white',
                          isSidebarExpanded
                            ? 'top-1/2 right-2 -translate-y-1/2'
                            : '-top-1 -right-1',
                        )}
                      >
                        {pendingReports.data.total}
                      </span>
                    )}
                  <span
                    className={cn(
                      isSidebarExpanded
                        ? 'truncate text-[12.5px] font-semibold text-foreground'
                        : 'nav-tip rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-semibold text-foreground',
                    )}
                  >
                    {label}
                  </span>
                </NavLink>
              ))}
            </nav>
          </aside>
        </div>

        <main className="min-w-0 flex-1 p-6 sm:p-[26px_30px_30px]">
          <div className="mb-[22px] flex flex-wrap items-start justify-between gap-3.5">
            <div className="flex items-start gap-3">
              <div className="flex size-[38px] shrink-0 items-center justify-center">
                {!isSidebarExpanded && (
                  <button
                    type="button"
                    aria-expanded={false}
                    aria-label="Mở rộng menu"
                    title="Mở rộng menu"
                    onClick={() => setIsSidebarExpanded(true)}
                    className="flex size-[38px] items-center justify-center rounded-[11px] border border-border bg-card text-muted-foreground transition-colors hover:border-primary hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  >
                    <PanelLeftOpen className="size-[18px]" aria-hidden />
                  </button>
                )}
              </div>
              <div>
                <h1 className="m-0 text-[21px] font-extrabold tracking-tight">
                  {pageMeta.title}
                </h1>
                <p className="mt-1 text-[12.5px] text-muted-foreground">
                  {pageMeta.subtitle}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                aria-label="Tìm kiếm"
                className="flex size-[38px] items-center justify-center rounded-[11px] border border-border bg-card text-muted-foreground hover:border-primary hover:text-foreground"
              >
                <Search className="size-4" aria-hidden />
              </button>
              <button
                type="button"
                aria-label="Thông báo"
                className="relative flex size-[38px] items-center justify-center rounded-[11px] border border-border bg-card text-muted-foreground hover:border-primary hover:text-foreground"
              >
                <Bell className="size-4" aria-hidden />
                <span className="absolute top-[7px] right-2 size-[7px] rounded-full border-[1.5px] border-card bg-destructive" />
              </button>
              <ThemeSlider />
              <div className="flex items-center gap-2 rounded-full border border-border bg-card py-[5px] pr-3 pl-[5px]">
                <div className="flex size-7 items-center justify-center rounded-full bg-accent text-[11px] font-extrabold text-avatar-foreground">
                  {roleInfo.initials}
                </div>
                <span className="text-[12.5px] font-bold">
                  {roleInfo.label}
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="size-[38px] rounded-[11px] p-0"
                onClick={() => logout.mutate()}
                disabled={logout.isPending}
                aria-label="Đăng xuất"
              >
                <LogOut className="size-4" aria-hidden />
              </Button>
            </div>
          </div>

          <Outlet />
        </main>
      </div>
      <ToastStack />
    </div>
  );
}
