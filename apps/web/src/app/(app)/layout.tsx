'use client';

import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

import { AuthGate } from '../../shared/auth/auth-gate';
import { useTranslation } from '../../shared/i18n/messages';
import {
  connectRealtime,
  disconnectRealtime,
  onReconnected,
} from '../../shared/realtime/socket';
import { ConfirmSheet } from '../../shared/ui/confirm-sheet';
import {
  DiscoveryIcon,
  FeedIcon,
  FriendsIcon,
  HomeIcon,
  MatchIcon,
  MoreIcon,
  PartyIcon,
  ProfileIcon,
  VideoIcon,
} from '../../shared/ui/icons';
import { ToastStack } from '../../shared/ui/toast-stack';

import type { MessageKey } from '../../shared/i18n/messages';
import type { ReactNode } from 'react';
import type { ComponentType, SVGProps } from 'react';

/**
 * Nav sau login khai 1 chỗ (docs/12 § 12.8 bước 3). Desktop đủ không gian nên giữ toàn bộ
 * điểm đến chính. Bottom nav mobile chỉ giữ 5 mục dùng thường xuyên nhất — Quanh đây và Ghép
 * đôi là hai hành trình cốt lõi nên luôn có mặt; Cá nhân không cần chiếm 1 tab riêng vì đã vào
 * được qua avatar ở header Trang chủ và hàng hồ sơ trong trang "Thêm". Video/Party/Bảng tin và
 * các mục tài khoản/hỗ trợ gom vào `/more` để nhãn không va nhau trên máy nhỏ.
 */
const NAV_ITEMS = [
  { href: '/home', labelKey: 'nav.home', Icon: HomeIcon, mobile: true },
  {
    href: '/discovery',
    labelKey: 'nav.discovery',
    Icon: DiscoveryIcon,
    mobile: true,
  },
  {
    href: '/matching',
    labelKey: 'nav.matching',
    Icon: MatchIcon,
    mobile: true,
  },
  { href: '/video', labelKey: 'nav.video', Icon: VideoIcon, mobile: false },
  { href: '/party', labelKey: 'nav.party', Icon: PartyIcon, mobile: false },
  { href: '/feed', labelKey: 'nav.feed', Icon: FeedIcon, mobile: false },
  {
    href: '/friends',
    labelKey: 'nav.friends',
    Icon: FriendsIcon,
    mobile: true,
  },
  {
    href: '/profile',
    labelKey: 'nav.profile',
    Icon: ProfileIcon,
    mobile: false,
  },
] satisfies ReadonlyArray<{
  href: string;
  labelKey: MessageKey;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  mobile: boolean;
}>;

/** Mục "Thêm" chỉ tồn tại ở bottom nav mobile — desktop sidebar đủ chỗ hiện thẳng mọi mục nên
 * không cần trang gom này. */
const MORE_NAV_ITEM = {
  href: '/more',
  labelKey: 'nav.more',
  Icon: MoreIcon,
} satisfies {
  href: string;
  labelKey: MessageKey;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
};

/**
 * Phiên trải nghiệm toàn màn hình (Movie/Soul/Voice Match khi đã vào 1 session cụ thể) — đúng
 * layouts/web/{movie,soul,voice}-match.html: KHÔNG có sidebar/bottom nav, chỉ có khung thẻ bo
 * góc + đổ bóng ở desktop (`data-lm-frame`), không phải layout app thường.
 */
const IMMERSIVE_SESSION_PATTERN =
  /^\/(movie-match|matching\/soul|matching\/voice)\/[^/]+$/;

/**
 * Video (reel) — vẫn có sidebar/bottom nav như trang thường nhưng KHÔNG có padding `main` phía
 * trên (đúng video.html: khung video chiếm trọn chiều cao ngay từ đỉnh — do VideoReelFeed tự vẽ
 * overlay riêng, không dùng hàng header dùng chung). Thiếu điều kiện này trước đó tạo khoảng
 * đen phía trên video trên mobile.
 */
const FULL_BLEED_CONTENT_PATTERN = /^\/video$/;

function ImmersiveSessionChrome({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-paper md:bg-slate-100 dark:bg-ink md:dark:bg-black">
      <div className="relative mx-auto flex min-h-screen max-w-[430px] flex-col md:my-6 md:min-h-0 md:h-[calc(100vh-3rem)] md:max-w-lg md:overflow-hidden md:rounded-[2rem] md:border md:border-black/10 md:shadow-2xl md:shadow-black/10 dark:md:border-white/10">
        {children}
        <ToastStack />
        <ConfirmSheet />
      </div>
    </div>
  );
}

function AppChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const t = useTranslation();

  // Vùng (app) là vùng realtime: connect khi vào, disconnect khi rời hẳn (logout)
  useEffect(() => {
    connectRealtime();
    const unsubscribeReconnect = onReconnected(() => {
      void queryClient.invalidateQueries();
    });
    return () => {
      unsubscribeReconnect();
      disconnectRealtime();
    };
  }, [queryClient]);

  const isActive = (href: string): boolean =>
    pathname === href || pathname.startsWith(`${href}/`);

  if (IMMERSIVE_SESSION_PATTERN.test(pathname)) {
    return <ImmersiveSessionChrome>{children}</ImmersiveSessionChrome>;
  }

  const fullBleed = FULL_BLEED_CONTENT_PATTERN.test(pathname);

  return (
    <div className="md:bg-slate-100 dark:md:bg-ink">
      <div className="md:grid md:min-h-screen md:grid-cols-[5rem_minmax(0,1fr)] lg:grid-cols-[15rem_minmax(0,1fr)]">
        <nav
          className="hidden md:sticky md:top-0 md:z-40 md:flex md:h-screen md:w-full md:flex-col md:gap-1.5 md:overflow-y-auto md:border-r md:border-black/5 md:bg-white/80 md:px-3 md:py-8 md:backdrop-blur lg:px-4 dark:md:border-white/5 dark:md:bg-[#110d14]/55"
          aria-label={t('nav.primary')}
        >
          <Link
            href="/home"
            className="font-display mb-6 hidden items-center gap-2.5 px-3 text-lg font-semibold italic text-iris lg:flex dark:text-[#f5eff3]"
          >
            <span className="h-6.5 w-6.5 shrink-0 rounded-full bg-gradient-to-br from-irisl to-aqual shadow-md shadow-iris/30" />
            Litmatch
          </Link>
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? 'page' : undefined}
              className={`flex items-center justify-center gap-3 rounded-xl px-3 py-3 transition lg:justify-start ${
                isActive(item.href)
                  ? 'bg-gradient-to-br from-iris/20 to-aqua/10 font-bold text-iris shadow-sm shadow-iris/10 dark:text-white dark:ring-1 dark:ring-inset dark:ring-iris/30'
                  : 'font-semibold text-muted-foreground hover:bg-iris/10 hover:text-iris dark:text-[#ab9dae] dark:hover:bg-white/5 dark:hover:text-[#f5eff3]'
              }`}
            >
              <item.Icon width={20} height={20} />
              <span className="hidden text-sm lg:inline">
                {t(item.labelKey)}
              </span>
            </Link>
          ))}
        </nav>

        <div
          className={`relative mx-auto min-h-screen w-full min-w-0 max-w-[430px] ${
            fullBleed ? 'md:max-w-none' : 'md:max-w-[1200px]'
          } ${fullBleed ? '' : 'pb-24 md:pb-10'}`}
        >
          <main className={`min-w-0 ${fullBleed ? '' : 'py-4'}`}>
            {children}
          </main>

          <nav
            className="fixed inset-x-0 bottom-0 z-40 mx-auto flex h-16 max-w-[430px] items-center justify-around border-t border-black/5 bg-white/90 px-2 backdrop-blur md:hidden dark:border-white/5 dark:bg-surf/90"
            aria-label={t('nav.mobile')}
          >
            {[...NAV_ITEMS.filter((item) => item.mobile), MORE_NAV_ITEM].map(
              (item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive(item.href) ? 'page' : undefined}
                  className={`flex h-full min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 transition ${
                    isActive(item.href)
                      ? 'bg-gradient-to-r from-aqua/15 via-iris/10 to-irisl/20 text-irisl dark:text-irisl'
                      : 'text-muted-foreground hover:bg-iris/[0.06] hover:text-irisl'
                  }`}
                >
                  <item.Icon width={20} height={20} />
                  <span className="truncate text-[10px] font-bold">
                    {t(item.labelKey)}
                  </span>
                </Link>
              ),
            )}
          </nav>

          <ToastStack />
          <ConfirmSheet />
        </div>
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
