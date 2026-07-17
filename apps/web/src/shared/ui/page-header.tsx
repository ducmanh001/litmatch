'use client';

import Link from 'next/link';

import { useWallet } from '../../features/wallet/api';
import { NotificationBell } from '../../features/notification/components/notification-bell';
import { cn } from '../lib/cn';
import { DiamondIcon } from './icons';
import { LanguageSelector } from './language-selector';
import { ThemeToggleButton } from './theme-toggle-button';

import type { ReactNode } from 'react';

function DiamondChip() {
  const { data: wallet } = useWallet();
  return (
    <Link
      href="/wallet"
      aria-label={`Mở ví, số dư ${wallet?.balance ?? 0} diamond`}
      className="flex shrink-0 items-center gap-1.5 rounded-full border border-diamond/20 bg-diamond/15 px-3 py-2 text-xs font-extrabold text-diamond-foreground transition hover:bg-diamond/20 dark:text-white"
    >
      <DiamondIcon />
      <span>{wallet?.balance ?? 0}</span>
    </Link>
  );
}

/** Cụm icon bên phải header, tách riêng để trang có hero tự vẽ (Quanh đây) vẫn dùng chung được
 * thay vì phải đi qua `PageHeader` trọn gói. `children` là action riêng của trang (nếu có),
 * hiện trước theme/ngôn ngữ/diamond/thông báo. Theme + ngôn ngữ chỉ hiện trên desktop
 * (`md:flex`) — mobile chật chỗ nên 2 mục này chỉ còn ở trang Thêm. */
export function HeaderActions({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={cn('flex shrink-0 items-center gap-2', className)}>
      {children}
      <ThemeToggleButton className="hidden md:flex" />
      <LanguageSelector className="hidden md:flex" />
      <DiamondChip />
      <NotificationBell />
    </div>
  );
}

/** Logo + wordmark "Litmatch" — đúng khối brand của trang Thêm, dùng lại làm nội dung mobile
 * cho mọi header (thay slogan riêng từng trang bằng nhận diện thương hiệu chung, gọn 1 dòng). */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'font-display flex items-center gap-2 text-lg font-semibold italic text-iris dark:text-[#f5eff3]',
        className,
      )}
    >
      <span className="h-6 w-6 shrink-0 rounded-full bg-gradient-to-br from-irisl to-aqual shadow-md shadow-iris/30" />
      Litmatch
    </span>
  );
}

/** Eyebrow-tag đúng badge-pill của layouts/web/quanh-day.html — dùng chung cho mọi header thay
 * vì mỗi trang tự bịa 1 kiểu. `icon` bị ép về đúng 1 cỡ (h-3 w-3) bất kể caller truyền
 * width/height gì cho icon component — tránh lặp lại lỗi trước đó (icon Quanh đây 22px làm pill
 * phồng to hơn hẳn các trang khác dù cùng dùng chung component này). `as="h1"` cho trang dùng
 * badge-pill này làm tiêu đề chính (không có heading lớn riêng bên dưới như Quanh đây). */
export function HeaderEyebrow({
  icon,
  className,
  as: Tag = 'p',
  children,
}: {
  icon?: ReactNode;
  className?: string;
  as?: 'p' | 'h1';
  children: ReactNode;
}) {
  return (
    <Tag
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-iris/15 bg-iris/10 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.1em] text-rose-700 [&>svg]:h-3 [&>svg]:w-3 dark:border-rose-300/25 dark:bg-rose-300/10 dark:text-rose-300',
        className,
      )}
    >
      {icon}
      {children}
    </Tag>
  );
}

/**
 * Header dùng chung cho mọi trang (app) — 1 chỗ khai duy nhất cho cụm icon bên phải (theme,
 * ngôn ngữ, diamond, thông báo), tránh mỗi trang tự lặp lại hoặc thiếu. Home truyền `leading`
 * riêng (avatar + lời chào); các trang khác truyền `eyebrow` + `eyebrowIcon`.
 *
 * Mobile ẩn hết slogan riêng từng trang, thay bằng `BrandMark` (đúng khối brand trang Thêm) —
 * đồng nhất nhận diện, đỡ rối vì mỗi trang 1 câu khác nhau trên màn hẹp. Dùng `hidden md:...`
 * để ẩn/hiện (giống cách `ThemeToggleButton`/`LanguageSelector` trong `HeaderActions` đã làm) —
 * KHÔNG dùng `sr-only`/`md:not-sr-only`: `not-sr-only` không compile trong Tailwind v4 ở bản
 * đang dùng (build ra rồi grep CSS thấy `.sr-only` có nhưng `.not-sr-only` không hề tồn tại) nên
 * eyebrow bị kẹt ở trạng thái ẩn vĩnh viễn, mất luôn trên desktop — đây là lỗi thật đã xảy ra.
 */
export function PageHeader({
  leading,
  eyebrow,
  eyebrowIcon,
  action,
  children,
}: {
  leading?: ReactNode;
  eyebrow?: string;
  eyebrowIcon?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="mb-6 border-b border-black/5 pb-5 dark:border-white/5">
      <div className="flex items-center justify-between gap-3">
        {leading ?? (
          <div className="flex min-w-0 items-center gap-3">
            <BrandMark className="md:hidden" />
            {eyebrow && (
              <HeaderEyebrow
                as={children ? 'p' : 'h1'}
                icon={eyebrowIcon}
                className="hidden px-3.5 py-2 text-sm md:flex [&>svg]:h-4 [&>svg]:w-4"
              >
                {eyebrow}
              </HeaderEyebrow>
            )}
          </div>
        )}
        <HeaderActions>{action}</HeaderActions>
      </div>
      {children && <div className="mt-4">{children}</div>}
    </header>
  );
}
