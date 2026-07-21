'use client';

import Link from 'next/link';

import { useLogout } from '../../../shared/auth/use-logout';
import {
  ChevronRightIcon,
  CrownIcon,
  DiamondIcon,
  HelpCircleIcon,
  ProfileIcon,
  ShieldIcon,
} from '../../../shared/ui/icons';

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
          <ChevronRightIcon className="text-slate-300" />
        </Link>
        <Link href="/wallet" className={rowClass}>
          <span className={`${iconWrapClass} bg-amber-400/15 text-amber-500`}>
            <CrownIcon />
          </span>
          <span className="flex-1 text-sm font-semibold">Nâng cấp VIP</span>
          <ChevronRightIcon className="text-slate-300" />
        </Link>
        <Link href="/profile/edit" className={rowClass}>
          <span className={iconWrapClass}>
            <ProfileIcon width={15} height={15} />
          </span>
          <span className="flex-1 text-sm font-semibold">
            Chỉnh sửa Avatar & hồ sơ
          </span>
          <ChevronRightIcon className="text-slate-300" />
        </Link>
        <Link href="/privacy" className={rowClass}>
          <span className={iconWrapClass}>
            <ShieldIcon />
          </span>
          <span className="flex-1 text-sm font-semibold">
            Quyền riêng tư, chặn & báo cáo
          </span>
          <ChevronRightIcon className="text-slate-300" />
        </Link>
        <Link href="/help" className={rowClass}>
          <span className={iconWrapClass}>
            <HelpCircleIcon />
          </span>
          <span className="flex-1 text-sm font-semibold">
            Trợ giúp & phản hồi
          </span>
          <ChevronRightIcon className="text-slate-300" />
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
