import { useMutation } from '@tanstack/react-query';
import {
  Bell,
  Command,
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
import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';

import { useReportsList } from '../features/moderation/api';
import { apiClient, tokenStore } from '../shared/api/client';
import { useRole } from '../shared/auth/use-role';
import { cn } from '../shared/lib/cn';
import { useT } from '../shared/i18n/catalog';
import { Button } from '../shared/ui/button';
import { LanguageToggle } from '../shared/ui/language-toggle';
import { Modal, ModalBody, ModalHeader } from '../shared/ui/modal';
import { ThemeSlider } from '../shared/ui/theme-slider';
import { ToastStack } from '../shared/ui/toast-stack';

/**
 * Nav khai báo tại 1 chỗ — feature mới thêm dòng vào đây, route vào router.tsx.
 * Thứ tự + icon khớp layouts/admins/litmatch-admin-dashboard (2).html.
 */
const NAV_ITEMS = [
  { to: '/', labelKey: 'shell.dashboard', icon: LayoutDashboard, end: true },
  { to: '/users', labelKey: 'shell.users', icon: Users },
  { to: '/moderation', labelKey: 'shell.moderation', icon: ShieldAlert },
  { to: '/economy', labelKey: 'shell.economy', icon: Gem },
  { to: '/gifts', labelKey: 'shell.gifts', icon: Gift },
  { to: '/rooms', labelKey: 'shell.rooms', icon: Radio },
  { to: '/config', labelKey: 'shell.config', icon: SlidersHorizontal },
  { to: '/permissions', labelKey: 'shell.permissions', icon: ShieldCheck },
] as const;

const PAGE_META = {
  '/': {
    title: 'shell.dashboard',
    subtitle: 'shell.dashboardSubtitle',
  },
  '/users': {
    title: 'shell.users',
    subtitle: 'shell.usersSubtitle',
  },
  '/moderation': {
    title: 'shell.moderation',
    subtitle: 'shell.moderationSubtitle',
  },
  '/economy': {
    title: 'shell.economy',
    subtitle: 'shell.economySubtitle',
  },
  '/gifts': {
    title: 'shell.gifts',
    subtitle: 'shell.giftsSubtitle',
  },
  '/rooms': { title: 'shell.rooms', subtitle: 'shell.roomsSubtitle' },
  '/config': {
    title: 'shell.config',
    subtitle: 'shell.configSubtitle',
  },
  '/permissions': {
    title: 'shell.permissions',
    subtitle: 'shell.permissionsSubtitle',
  },
} as const;

const ROLE_LABEL = {
  admin: { initials: 'AD', labelKey: 'shell.admin' },
  moderator: { initials: 'MO', labelKey: 'shell.moderator' },
  user: { initials: 'U', labelKey: 'shell.user' },
} as const;

interface SearchCommand {
  label: string;
  hint: string;
  to: string;
}

export function AppShell() {
  const t = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const role = useRole();
  const pendingReports = useReportsList('pending', 0);
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [isCommandSearchOpen, setIsCommandSearchOpen] = useState(false);
  const mobileDrawerRef = useRef<HTMLElement>(null);
  const mobileMenuTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (
        (event.key === '/' &&
          !(
            event.target instanceof HTMLInputElement ||
            event.target instanceof HTMLTextAreaElement
          )) ||
        ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k')
      ) {
        event.preventDefault();
        setIsMobileDrawerOpen(false);
        setIsCommandSearchOpen(true);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!isMobileDrawerOpen) return;
    const drawer = mobileDrawerRef.current;
    const trigger = mobileMenuTriggerRef.current;
    const focusableSelector =
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';
    drawer?.querySelector<HTMLElement>(focusableSelector)?.focus();

    function onDrawerKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.preventDefault();
        setIsMobileDrawerOpen(false);
        return;
      }
      if (event.key !== 'Tab' || drawer === null) return;
      const focusable = Array.from(
        drawer.querySelectorAll<HTMLElement>(focusableSelector),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onDrawerKeyDown);
    return () => {
      document.removeEventListener('keydown', onDrawerKeyDown);
      trigger?.focus();
    };
  }, [isMobileDrawerOpen]);

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
    labelKey: 'common.loading',
  };
  return (
    <div className="flex min-h-screen w-full bg-page">
      <div className="flex min-h-screen w-full bg-background">
        {isMobileDrawerOpen && (
          <button
            type="button"
            aria-label={t('shell.closeMenu')}
            className="fixed inset-0 z-40 bg-black/60 md:hidden"
            onClick={() => setIsMobileDrawerOpen(false)}
          />
        )}
        <div
          className={cn(
            'relative hidden h-screen shrink-0 self-start transition-[width] duration-200 ease-out md:sticky md:top-0 md:block',
            isSidebarExpanded ? 'w-[272px]' : 'w-[74px]',
          )}
        >
          <aside
            aria-label={
              isSidebarExpanded
                ? t('shell.expandedMenu')
                : t('shell.collapsedMenu')
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
              {!isSidebarExpanded && (
                <button
                  type="button"
                  aria-expanded={false}
                  aria-label={t('shell.expandMenu')}
                  title={t('shell.expandMenu')}
                  onClick={() => setIsSidebarExpanded(true)}
                  className="absolute top-[48px] right-1 flex size-6 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-md transition-colors hover:border-primary hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  <PanelLeftOpen className="size-3.5" aria-hidden />
                </button>
              )}
              {isSidebarExpanded && (
                <span className="truncate text-sm font-extrabold">
                  Litmatch Admin
                </span>
              )}
              {isSidebarExpanded && (
                <button
                  type="button"
                  aria-expanded
                  aria-label={t('shell.collapseMenu')}
                  title={t('shell.collapseMenu')}
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
              aria-label={t('shell.mainNavigation')}
            >
              {NAV_ITEMS.map(({ to, labelKey, icon: Icon, ...rest }) => (
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
                    {t(labelKey)}
                  </span>
                </NavLink>
              ))}
            </nav>
          </aside>
        </div>

        <aside
          ref={mobileDrawerRef}
          role="dialog"
          aria-modal="true"
          aria-label={t('shell.mobileMenu')}
          aria-hidden={!isMobileDrawerOpen}
          inert={!isMobileDrawerOpen}
          className={cn(
            'fixed inset-y-0 left-0 z-50 flex w-[min(86vw,300px)] flex-col gap-3 overflow-y-auto border-r border-border bg-muted px-3 py-[18px] shadow-2xl transition-transform duration-200 md:hidden',
            isMobileDrawerOpen ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          <div className="mb-2 flex h-[42px] items-center gap-3 px-1">
            <div className="flex size-[38px] shrink-0 items-center justify-center rounded-[11px] bg-primary text-brand-foreground">
              <Gem className="size-[19px]" aria-hidden />
            </div>
            <span className="truncate text-sm font-extrabold">
              Litmatch Admin
            </span>
            <button
              type="button"
              aria-label={t('shell.closeMenu')}
              onClick={() => setIsMobileDrawerOpen(false)}
              className="ml-auto flex size-[38px] items-center justify-center rounded-[11px] border border-border bg-card text-muted-foreground hover:border-primary hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
            >
              <PanelLeftClose className="size-[18px]" aria-hidden />
            </button>
          </div>
          <nav
            className="flex flex-col gap-2"
            aria-label={t('shell.mobileNavigation')}
          >
            {NAV_ITEMS.map(({ to, labelKey, icon: Icon, ...rest }) => (
              <NavLink
                key={to}
                to={to}
                end={'end' in rest}
                onClick={() => setIsMobileDrawerOpen(false)}
                className={({ isActive }) =>
                  cn(
                    'flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-muted-foreground hover:bg-card hover:text-foreground',
                    isActive && 'bg-primary-soft text-primary',
                  )
                }
              >
                <Icon className="size-[19px]" aria-hidden />
                <span>{t(labelKey)}</span>
              </NavLink>
            ))}
          </nav>
        </aside>

        <main
          inert={isMobileDrawerOpen}
          className="min-w-0 flex-1 p-4 sm:p-[26px_30px_30px]"
        >
          <div className="mb-[22px] flex flex-wrap items-start justify-between gap-3.5">
            <div className="flex items-start gap-3">
              <button
                ref={mobileMenuTriggerRef}
                type="button"
                aria-expanded={isMobileDrawerOpen}
                aria-label={t('shell.openMenu')}
                title={t('shell.openMenu')}
                onClick={() => setIsMobileDrawerOpen(true)}
                className="flex size-[38px] shrink-0 items-center justify-center rounded-[11px] border border-border bg-card text-muted-foreground hover:border-primary hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary md:hidden"
              >
                <PanelLeftOpen className="size-[18px]" aria-hidden />
              </button>
              <div>
                <h1 className="m-0 text-[21px] font-extrabold tracking-tight">
                  {t(pageMeta.title)}
                </h1>
                <p className="mt-1 hidden text-[12.5px] text-muted-foreground sm:block">
                  {t(pageMeta.subtitle)}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                aria-label={t('shell.openCommandSearch')}
                title={t('shell.searchShortcut')}
                onClick={() => {
                  setIsMobileDrawerOpen(false);
                  setIsCommandSearchOpen(true);
                }}
                className="flex size-[38px] items-center justify-center rounded-[11px] border border-border bg-card text-muted-foreground hover:border-primary hover:text-foreground"
              >
                <Search className="size-4" aria-hidden />
              </button>
              <button
                type="button"
                aria-label={t('shell.openPendingReports')}
                title={t('shell.pendingReports')}
                onClick={() =>
                  navigate('/moderation?tab=reports&status=pending')
                }
                className="relative flex size-[38px] items-center justify-center rounded-[11px] border border-border bg-card text-muted-foreground hover:border-primary hover:text-foreground"
              >
                <Bell className="size-4" aria-hidden />
                {pendingReports.data !== undefined &&
                  pendingReports.data.total > 0 && (
                    <span className="absolute top-[7px] right-2 size-[7px] rounded-full border-[1.5px] border-card bg-destructive" />
                  )}
              </button>
              <ThemeSlider />
              <LanguageToggle />
              <div className="flex items-center gap-2 rounded-full border border-border bg-card py-[5px] pr-3 pl-[5px]">
                <div className="flex size-7 items-center justify-center rounded-full bg-accent text-[11px] font-extrabold text-avatar-foreground">
                  {roleInfo.initials}
                </div>
                <span className="hidden text-[12.5px] font-bold xl:inline">
                  {t(roleInfo.labelKey)}
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="size-[38px] rounded-[11px] p-0"
                onClick={() => logout.mutate()}
                disabled={logout.isPending}
                aria-label={t('auth.signOut')}
              >
                <LogOut className="size-4" aria-hidden />
              </Button>
            </div>
          </div>

          <Outlet />
        </main>
      </div>
      <ToastStack />
      {isCommandSearchOpen && (
        <CommandSearch
          onClose={() => setIsCommandSearchOpen(false)}
          onNavigate={(to) => {
            setIsCommandSearchOpen(false);
            navigate(to);
          }}
        />
      )}
    </div>
  );
}

function CommandSearch({
  onClose,
  onNavigate,
}: {
  onClose: () => void;
  onNavigate: (to: string) => void;
}) {
  const t = useT();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const commands = useMemo<SearchCommand[]>(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return NAV_ITEMS.filter(
      (item) =>
        normalized === '' ||
        t(item.labelKey).toLocaleLowerCase().includes(normalized) ||
        item.to.toLocaleLowerCase().includes(normalized),
    ).map((item) => ({
      label: t(item.labelKey),
      hint: item.to,
      to: item.to,
    }));
  }, [query, t]);

  return (
    <Modal open onClose={onClose} labelledBy="command-search-title">
      <ModalHeader
        title={t('shell.commandSearchTitle')}
        titleId="command-search-title"
        onClose={onClose}
      />
      <ModalBody>
        <label htmlFor="command-search" className="sr-only">
          {t('shell.commandSearchLabel')}
        </label>
        <div className="flex items-center gap-2 rounded-xl border border-border bg-muted px-3 focus-within:border-primary">
          <Search className="size-4 text-muted-foreground" aria-hidden />
          <input
            id="command-search"
            data-autofocus
            autoComplete="off"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                if (commands.length === 0) return;
                setActiveIndex((current) => {
                  const direction = event.key === 'ArrowDown' ? 1 : -1;
                  return (
                    (current + direction + commands.length) % commands.length
                  );
                });
              } else if (event.key === 'Enter' && commands[activeIndex]) {
                event.preventDefault();
                onNavigate(commands[activeIndex].to);
              }
            }}
            placeholder={t('shell.commandSearchPlaceholder')}
            className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
          <Command className="size-4 text-muted-foreground" aria-hidden />
        </div>
        <div
          role="listbox"
          aria-label={t('shell.commandSearchResults')}
          className="mt-3 max-h-72 space-y-1 overflow-y-auto"
        >
          {commands.map((command, index) => (
            <button
              key={`${command.to}-${command.label}`}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              onMouseMove={() => setActiveIndex(index)}
              onClick={() => onNavigate(command.to)}
              className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-muted aria-selected:bg-primary-soft aria-selected:text-primary"
            >
              <span className="font-semibold">{command.label}</span>
              <span className="truncate font-mono text-[10px] text-muted-foreground">
                {command.hint}
              </span>
            </button>
          ))}
          {commands.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              {t('shell.noSearchResults')}
            </p>
          )}
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">
          {t('shell.commandSearchHint')}
        </p>
      </ModalBody>
    </Modal>
  );
}
