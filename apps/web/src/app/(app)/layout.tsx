'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

import { AuthGate } from '../../shared/auth/auth-gate';
import {
  connectRealtime,
  disconnectRealtime,
} from '../../shared/realtime/socket';
import { ConfirmSheet } from '../../shared/ui/confirm-sheet';
import {
  FeedIcon,
  FriendsIcon,
  HomeIcon,
  LogoMark,
  PartyIcon,
  ProfileIcon,
  VideoIcon,
} from '../../shared/ui/icons';
import { ThemeSwitcher } from '../../shared/ui/theme-switcher';
import { ToastStack } from '../../shared/ui/toast-stack';

import type { ReactNode } from 'react';
import type { ComponentType, SVGProps } from 'react';

/**
 * Nav sau login khai 1 chỗ (docs/12 § 12.8 bước 3) — đúng 6 mục & nhãn của
 * layouts/web/*.html (sidebar desktop và bottom nav di động dùng chung 1 danh sách, không
 * còn tách sidebarOnly). Ghép đôi/Khám phá/Ví không có trong nav của mockup — vào qua Trang
 * chủ (mode-card, diamond badge) và Hồ sơ, đúng discovery.html chỉ được link từ trang landing.
 */
const NAV_ITEMS = [
  { href: '/home', label: 'Trang chủ', Icon: HomeIcon },
  { href: '/video', label: 'Video', Icon: VideoIcon },
  { href: '/party', label: 'Party', Icon: PartyIcon },
  { href: '/feed', label: 'Bảng tin', Icon: FeedIcon },
  { href: '/friends', label: 'Tin nhắn', Icon: FriendsIcon },
  { href: '/profile', label: 'Cá nhân', Icon: ProfileIcon },
] satisfies ReadonlyArray<{
  href: string;
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
}>;

/**
 * Phiên trải nghiệm toàn màn hình (Movie/Soul/Voice Match khi đã vào 1 session cụ thể) — đúng
 * layouts/web/{movie,soul,voice}-match.html: KHÔNG có sidebar/bottom nav, chỉ có khung thẻ bo
 * góc + đổ bóng ở desktop (`data-lm-frame`), không phải layout app thường.
 */
const IMMERSIVE_SESSION_PATTERN =
  /^\/(movie-match|matching\/soul|matching\/voice)\/[^/]+$/;

function ImmersiveSessionChrome({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-paper md:bg-slate-100 dark:bg-ink md:dark:bg-black">
      <div className="relative mx-auto flex min-h-screen max-w-[430px] flex-col md:my-6 md:min-h-0 md:h-[calc(100vh-3rem)] md:max-w-lg md:overflow-hidden md:rounded-[2rem] md:border md:border-black/10 md:shadow-2xl md:shadow-black/10 dark:md:border-white/10">
        <div className="flex justify-end px-5 pt-3">
          <ThemeSwitcher />
        </div>
        {children}
        <ToastStack />
        <ConfirmSheet />
      </div>
    </div>
  );
}

function AppChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  // Vùng (app) là vùng realtime: connect khi vào, disconnect khi rời hẳn (logout)
  useEffect(() => {
    connectRealtime();
    return disconnectRealtime;
  }, []);

  const isActive = (href: string): boolean =>
    pathname === href || pathname.startsWith(`${href}/`);

  if (IMMERSIVE_SESSION_PATTERN.test(pathname)) {
    return <ImmersiveSessionChrome>{children}</ImmersiveSessionChrome>;
  }

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
      </nav>

      <div
        className="relative mx-auto min-h-screen w-full max-w-[430px] pb-24 md:max-w-2xl md:flex-1 md:pb-10 lg:max-w-[1200px]"
        style={{ contain: 'layout' }}
      >
        <div className="flex justify-end px-5 pt-3">
          <ThemeSwitcher />
        </div>

        <main className="py-4">{children}</main>

        <nav
          className="fixed inset-x-0 bottom-0 z-40 mx-auto flex h-16 max-w-[430px] items-center justify-around border-t border-black/5 bg-white/90 px-2 backdrop-blur md:hidden dark:border-white/5 dark:bg-surf/90"
          aria-label="Điều hướng chính (di động)"
        >
          {NAV_ITEMS.map((item) => (
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
