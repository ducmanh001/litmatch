'use client';

import Link from 'next/link';

import { useLogout } from '../../../shared/auth/use-logout';
import { DiamondIcon, ProfileIcon } from '../../../shared/ui/icons';
import { ThemeSwitcher } from '../../../shared/ui/theme-switcher';

import type { SVGProps } from 'react';

function ChevronRightIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="text-slate-300"
      {...props}
    >
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

function CrownIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={15}
      height={15}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <path d="M3 8l4 3 5-6 5 6 4-3-2 11H5z" />
    </svg>
  );
}

function ShieldIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={15}
      height={15}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <path d="M12 2l8 4v6c0 5-3.4 8.7-8 10-4.6-1.3-8-5-8-10V6z" />
    </svg>
  );
}

function HelpCircleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={15}
      height={15}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <circle cx={12} cy={12} r={9} />
      <path d="M9.5 9a2.5 2.5 0 015 .5c0 1.5-2 1.5-2 3.5M12 17h.01" />
    </svg>
  );
}

const rowClass =
  'flex items-center gap-3 px-4 py-3.5 first:rounded-t-2xl last:rounded-b-2xl';
const iconWrapClass =
  'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-iris/10 text-irisl';

export function ProfileMenu() {
  const logout = useLogout();

  return (
    <div className="mb-4 space-y-3">
      <div className="divide-y divide-black/5 overflow-hidden rounded-2xl border border-black/5 bg-white dark:divide-white/5 dark:border-white/5 dark:bg-surf">
        <Link href="/wallet" className={rowClass}>
          <span
            className={`${iconWrapClass} bg-diamond/15 text-sky-600 dark:text-diamond`}
          >
            <DiamondIcon width={15} height={15} />
          </span>
          <span className="flex-1 text-sm font-semibold">
            Ví Diamond & Giao dịch
          </span>
          <ChevronRightIcon />
        </Link>
        <Link href="/wallet" className={rowClass}>
          <span className={`${iconWrapClass} bg-amber-400/15 text-amber-500`}>
            <CrownIcon />
          </span>
          <span className="flex-1 text-sm font-semibold">Nâng cấp VIP</span>
          <ChevronRightIcon />
        </Link>
        <Link href="/profile/edit" className={rowClass}>
          <span className={iconWrapClass}>
            <ProfileIcon width={15} height={15} />
          </span>
          <span className="flex-1 text-sm font-semibold">
            Chỉnh sửa Avatar & hồ sơ
          </span>
          <ChevronRightIcon />
        </Link>
        <div className={rowClass}>
          <span className={iconWrapClass}>
            <svg
              width={15}
              height={15}
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden
            >
              <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
            </svg>
          </span>
          <span className="flex-1 text-sm font-semibold">Giao diện màu</span>
          <ThemeSwitcher />
        </div>
        <Link href="/privacy" className={rowClass}>
          <span className={iconWrapClass}>
            <ShieldIcon />
          </span>
          <span className="flex-1 text-sm font-semibold">
            Quyền riêng tư, chặn & báo cáo
          </span>
          <ChevronRightIcon />
        </Link>
        <Link href="/help" className={rowClass}>
          <span className={iconWrapClass}>
            <HelpCircleIcon />
          </span>
          <span className="flex-1 text-sm font-semibold">
            Trợ giúp & phản hồi
          </span>
          <ChevronRightIcon />
        </Link>
      </div>

      <button
        type="button"
        onClick={logout}
        className="block w-full rounded-2xl border border-black/5 bg-white py-3 text-center text-sm font-bold text-rose-500 dark:border-white/5 dark:bg-surf"
      >
        Đăng xuất
      </button>
    </div>
  );
}
