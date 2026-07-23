'use client';

import Link from 'next/link';

import { useLogout } from '../../../shared/auth/use-logout';
import { useTranslation } from '../../../shared/i18n/messages';
import {
  ChevronRightIcon,
  CrownIcon,
  DiamondIcon,
  HelpCircleIcon,
  ProfileIcon,
  ShieldIcon,
} from '../../../shared/ui/icons';
import { LanguageSelector } from '../../../shared/ui/language-selector';

const rowClass =
  'flex items-center gap-3 px-4 py-3.5 first:rounded-t-2xl last:rounded-b-2xl';
const iconWrapClass =
  'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-iris/10 text-irisl';

export function ProfileMenu() {
  const logout = useLogout();
  const t = useTranslation();

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
            {t('profile.wallet')}
          </span>
          <ChevronRightIcon className="text-slate-300" />
        </Link>
        <Link href="/wallet" className={rowClass}>
          <span className={`${iconWrapClass} bg-amber-400/15 text-amber-500`}>
            <CrownIcon />
          </span>
          <span className="flex-1 text-sm font-semibold">
            {t('profile.vip')}
          </span>
          <ChevronRightIcon className="text-slate-300" />
        </Link>
        <Link href="/profile/edit" className={rowClass}>
          <span className={iconWrapClass}>
            <ProfileIcon width={15} height={15} />
          </span>
          <span className="flex-1 text-sm font-semibold">
            {t('profile.edit')}
          </span>
          <ChevronRightIcon className="text-slate-300" />
        </Link>
        <div className={rowClass}>
          <span className="flex-1 text-sm font-semibold">
            {t('profile.language')}
          </span>
          <LanguageSelector />
        </div>
        <Link href="/privacy" className={rowClass}>
          <span className={iconWrapClass}>
            <ShieldIcon />
          </span>
          <span className="flex-1 text-sm font-semibold">
            {t('profile.privacy')}
          </span>
          <ChevronRightIcon className="text-slate-300" />
        </Link>
        <Link href="/help" className={rowClass}>
          <span className={iconWrapClass}>
            <HelpCircleIcon />
          </span>
          <span className="flex-1 text-sm font-semibold">
            {t('profile.help')}
          </span>
          <ChevronRightIcon className="text-slate-300" />
        </Link>
      </div>

      <button
        type="button"
        onClick={logout}
        className="block w-full rounded-2xl border border-black/5 bg-white py-3 text-center text-sm font-bold text-rose-500 dark:border-white/5 dark:bg-surf"
      >
        {t('profile.logout')}
      </button>
    </div>
  );
}
