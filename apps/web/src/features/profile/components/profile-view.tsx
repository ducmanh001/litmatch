'use client';

import { isApiError } from '@litmatch/api-client';
import Link from 'next/link';

import { useCurrentUser } from '../../../shared/auth/use-current-user';
import { useTranslation } from '../../../shared/i18n/messages';
import { ProfileIcon } from '../../../shared/ui/icons';
import { PageHeader } from '../../../shared/ui/page-header';
import { PlaceholderAvatar } from '../../../shared/ui/placeholder-avatar';
import { useWallet } from '../../wallet/api';
import { ProfileMenu } from './profile-menu';
import { ProfilePostsGrid } from './profile-posts-grid';
import { ProfileStats } from './profile-stats';

export function ProfileView() {
  const profile = useCurrentUser();
  const t = useTranslation();
  // Ví đã có sẵn cho stat Diamond (ProfileStats) — dùng chung query này để lấy vipTier thật
  // cho badge VIP, tránh gọi thêm 1 endpoint riêng (MyProfileDto không có field vipTier).
  const wallet = useWallet();

  if (profile.isPending) {
    return (
      <p className="px-5 text-sm text-slate-500 dark:text-slate-400">
        {t('profile.loading')}
      </p>
    );
  }

  if (profile.isError) {
    const message = isApiError(profile.error)
      ? profile.error.message
      : t('profile.error');
    return (
      <p role="alert" className="px-5 text-sm text-destructive">
        {message}
      </p>
    );
  }

  if (profile.data === undefined) {
    return (
      <p className="px-5 text-sm text-slate-500 dark:text-slate-400">
        {t('profile.empty')}
      </p>
    );
  }

  const vipTier = wallet.data?.vipTier ?? null;

  return (
    <div>
      <div className="px-5">
        <PageHeader
          eyebrow={t('profile.eyebrow')}
          eyebrowIcon={<ProfileIcon width={16} height={16} />}
        />
      </div>

      <div className="h-28 bg-gradient-to-br from-irisl to-aqual" />

      <div className="relative -mt-10 px-5">
        <div className="relative mb-3 h-24 w-24">
          <PlaceholderAvatar
            seed={profile.data.id}
            alt={profile.data.nickname}
            size={96}
            className="dark:border-ink"
          />
          <Link
            href="/profile/edit"
            aria-label={t('profile.changeAvatar')}
            className="absolute bottom-0 right-0 flex h-7 w-7 items-center justify-center rounded-full border-2 border-paper bg-iris text-white dark:border-ink"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth={2.5}
              aria-hidden
            >
              <path
                d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Link>
        </div>

        <div className="mb-5">
          <div className="mb-1 flex items-center gap-2">
            <h1 className="font-display truncate text-xl font-semibold italic">
              {profile.data.nickname}
            </h1>
            {(vipTier === 'vip' || vipTier === 'svip') && (
              <span className="rounded-full bg-gradient-to-br from-amber-400 to-amber-600 px-2 py-0.5 text-[10px] font-extrabold text-white">
                {vipTier.toUpperCase()}
              </span>
            )}
          </div>

          {profile.data.isGuest && (
            <p className="mt-4 rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-500 dark:bg-surf2 dark:text-slate-400">
              {t('profile.guestNotice')}
            </p>
          )}
        </div>

        <ProfileStats />
        <ProfilePostsGrid userId={profile.data.id} />
        <ProfileMenu />
      </div>
    </div>
  );
}
