'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

import { AuthGate } from '../../shared/auth/auth-gate';
import { useLogout } from '../../shared/auth/use-logout';
import {
  connectRealtime,
  disconnectRealtime,
} from '../../shared/realtime/socket';
import { ConfirmSheet } from '../../shared/ui/confirm-sheet';
import {
  DiscoveryIcon,
  FeedIcon,
  FriendsIcon,
  HomeIcon,
  LogoMark,
  LogoutIcon,
  MatchIcon,
  PartyIcon,
  ProfileIcon,
  VideoIcon,
  WalletIcon,
} from '../../shared/ui/icons';
import { ThemeSwitcher } from '../../shared/ui/theme-switcher';
import { ToastStack } from '../../shared/ui/toast-stack';

import type { ReactNode } from 'react';
import type { ComponentType, SVGProps } from 'react';

/**
 * Nav sau login khai 1 chỗ (docs/12 § 12.8 bước 3). `sidebarOnly` dành cho mục mới hơn
 * (Khám phá, Video) — bottom nav di động đã đủ 7 mục, thêm nữa sẽ quá chật trên màn hình hẹp;
 * mục sidebarOnly vẫn vào được từ trang chủ trên di động.
 */
const NAV_ITEMS = [
  { href: '/home', label: 'Trang chủ', Icon: HomeIcon },
  { href: '/video', label: 'Video', Icon: VideoIcon, sidebarOnly: true },
  { href: '/feed', label: 'Bảng tin', Icon: FeedIcon },
  { href: '/matching', label: 'Ghép đôi', Icon: MatchIcon },
  {
    href: '/discovery',
    label: 'Khám phá',
    Icon: DiscoveryIcon,
    sidebarOnly: true,
  },
  { href: '/friends', label: 'Bạn bè', Icon: FriendsIcon },
  { href: '/party', label: 'Phòng nhóm', Icon: PartyIcon },
  { href: '/wallet', label: 'Ví', Icon: WalletIcon },
  { href: '/profile', label: 'Hồ sơ', Icon: ProfileIcon },
] satisfies ReadonlyArray<{
  href: string;
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  sidebarOnly?: boolean;
}>;

function AppChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  // Vùng (app) là vùng realtime: connect khi vào, disconnect khi rời hẳn (logout)
  useEffect(() => {
    connectRealtime();
    return disconnectRealtime;
  }, []);

  const logout = useLogout();

  const isActive = (href: string): boolean =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="md:flex md:bg-slate-100 md:dark:bg-black">
      <nav
        className="hidden md:sticky md:top-0 md:z-40 md:flex md:h-screen md:w-20 md:shrink-0 md:flex-col md:gap-1.5 md:border-r md:border-black/5 md:bg-white/80 md:px-3 md:py-8 md:backdrop-blur lg:w-60 lg:px-4 dark:md:border-white/5 dark:md:bg-surf/60"
        aria-label="Điều hướng chính"
      >
        <Link
          href="/home"
          className="font-display mb-6 hidden items-center gap-2 px-3 text-lg font-semibold italic lg:flex"
        >
          <LogoMark />
          Litmatch
        </Link>
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive(item.href) ? 'page' : undefined}
            className={`flex items-center justify-center gap-3 rounded-xl px-3 py-3 transition lg:justify-start ${
              isActive(item.href)
                ? 'bg-iris/10 font-bold text-irisl'
                : 'font-semibold text-slate-400 hover:bg-black/5 dark:hover:bg-white/5'
            }`}
          >
            <item.Icon width={20} height={20} />
            <span className="hidden text-sm lg:inline">{item.label}</span>
          </Link>
        ))}
        <button
          type="button"
          onClick={logout}
          className="mt-auto flex items-center justify-center gap-3 rounded-xl px-3 py-3 font-semibold text-slate-400 transition hover:bg-black/5 lg:justify-start dark:hover:bg-white/5"
        >
          <LogoutIcon width={20} height={20} />
          <span className="hidden text-sm lg:inline">Đăng xuất</span>
        </button>
      </nav>

      <div
        className="relative mx-auto min-h-screen w-full max-w-[430px] pb-24 md:max-w-2xl md:flex-1 md:pb-10 lg:max-w-[1200px]"
        style={{ contain: 'layout' }}
      >
        <div className="flex items-center justify-between px-5 pt-3 md:hidden">
          <Link
            href="/home"
            className="font-display flex items-center gap-2 text-lg font-semibold italic"
          >
            <LogoMark width={20} height={20} />
            Litmatch
          </Link>
          <div className="flex items-center gap-2">
            <ThemeSwitcher className="p-1" />
            <button
              type="button"
              onClick={logout}
              aria-label="Đăng xuất"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 dark:bg-surf2"
            >
              <LogoutIcon width={16} height={16} />
            </button>
          </div>
        </div>
        <div className="hidden justify-end px-5 pt-3 md:flex">
          <ThemeSwitcher />
        </div>

        <main className="py-4">{children}</main>

        <nav
          className="fixed inset-x-0 bottom-0 z-40 mx-auto flex h-16 max-w-[430px] items-center justify-around border-t border-black/5 bg-white/90 px-2 backdrop-blur md:hidden dark:border-white/5 dark:bg-surf/90"
          aria-label="Điều hướng chính (di động)"
        >
          {NAV_ITEMS.filter((item) => item.sidebarOnly !== true).map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? 'page' : undefined}
              className={`flex flex-col items-center gap-1 ${
                isActive(item.href) ? 'text-irisl' : 'text-slate-400'
              }`}
            >
              <item.Icon width={20} height={20} />
              <span className="text-[10px] font-bold">{item.label}</span>
            </Link>
          ))}
        </nav>

        <ToastStack />
        <ConfirmSheet />
      </div>
    </div>
  );
}

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGate>
      <AppChrome>{children}</AppChrome>
    </AuthGate>
  );
}
