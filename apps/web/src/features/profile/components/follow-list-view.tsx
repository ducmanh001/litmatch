'use client';

import { isApiError } from '@litmatch/api-client';
import Link from 'next/link';

import { useCurrentUser } from '../../../shared/auth/use-current-user';
import { useTranslation } from '../../../shared/i18n/messages';
import { showToast } from '../../../shared/lib/toast-store';
import { ChevronLeftIcon } from '../../../shared/ui/icons';
import { PlaceholderAvatar } from '../../../shared/ui/placeholder-avatar';
import { useFollowCounts, useFollowList, useFollowProfile } from '../api';

import type { FollowListKind } from '../api';

const TABS = [
  { kind: 'followers', labelKey: 'follow.followers' },
  { kind: 'following', labelKey: 'follow.following' },
] as const;

/**
 * Nút theo dõi / theo dõi lại / bỏ theo dõi cho một dòng. Trạng thái lấy từ server (`isFollowing`
 * của dòng) và làm mới sau mỗi lần bấm; nằm ngoài link của dòng nên bấm nút không chuyển trang.
 */
function FollowButton({
  userId,
  isFollowing,
  kind,
}: {
  userId: string;
  isFollowing: boolean;
  kind: FollowListKind;
}) {
  const t = useTranslation();
  const followProfile = useFollowProfile(userId);

  const toggle = () =>
    followProfile.mutate(!isFollowing, {
      onError: (error) =>
        showToast(
          isApiError(error) ? error.message : t('follow.updateError'),
          'warn',
        ),
    });

  // Đã theo dõi: nút trung tính (bấm để bỏ theo dõi). Chưa theo dõi: nút nổi bật — "theo dõi lại"
  // khi họ đang theo dõi mình (danh sách followers), "theo dõi" ở nơi khác.
  const label = isFollowing
    ? t('follow.followingNow')
    : kind === 'followers'
      ? t('follow.followBack')
      : t('follow.follow');

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={followProfile.isPending}
      className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold transition disabled:opacity-50 ${
        isFollowing
          ? 'border border-black/10 text-slate-600 hover:bg-black/[0.03] dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/[0.05]'
          : 'bg-irisl text-white hover:brightness-105'
      }`}
    >
      {label}
    </button>
  );
}

/**
 * Danh sách người theo dõi / đang theo dõi của một hồ sơ (của mình hoặc người khác). Server là
 * nguồn sự thật cho thứ tự, phân trang và việc ẩn user bị chặn — UI chỉ trình bày từng trang.
 */
export function FollowListView({
  userId,
  kind,
}: {
  userId: string;
  kind: FollowListKind;
}) {
  const t = useTranslation();
  const currentUser = useCurrentUser();
  const counts = useFollowCounts(userId);
  const list = useFollowList(userId, kind);

  const myId = currentUser.data?.id;
  const profileHref = myId === userId ? '/profile' : `/users/${userId}`;
  const items = list.data?.pages.flatMap((page) => page?.items ?? []) ?? [];

  return (
    <div className="px-4 pb-8">
      <header className="mb-4 flex items-center gap-3">
        <Link
          href={profileHref}
          aria-label={t('follow.back')}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-surf2"
        >
          <ChevronLeftIcon width={16} height={16} />
        </Link>
        <h1 className="font-display text-2xl font-semibold italic">
          {kind === 'followers' ? t('follow.followers') : t('follow.following')}
        </h1>
      </header>

      <nav
        aria-label={t('follow.tabs')}
        className="mb-5 grid grid-cols-2 rounded-2xl bg-slate-100 p-1 dark:bg-surf2"
      >
        {TABS.map((tab) => {
          const active = tab.kind === kind;
          const count =
            tab.kind === 'followers'
              ? counts.data?.followerCount
              : counts.data?.followingCount;
          return (
            <Link
              key={tab.kind}
              href={`/users/${userId}/${tab.kind}`}
              aria-current={active ? 'page' : undefined}
              className={`rounded-xl px-3 py-2 text-center text-sm transition ${
                active
                  ? 'bg-white font-extrabold text-irisl shadow-sm dark:bg-surf'
                  : 'font-semibold text-slate-500 dark:text-slate-400'
              }`}
            >
              {t(tab.labelKey)}
              {count !== undefined && (
                <span className="ml-1.5 text-xs opacity-70">
                  {count.toLocaleString('vi-VN')}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {list.isPending && (
        <p className="text-sm text-slate-500">{t('follow.loading')}</p>
      )}

      {list.isError && (
        <p role="alert" className="text-sm text-destructive">
          {isApiError(list.error)
            ? list.error.message
            : t('common.somethingWentWrong')}
        </p>
      )}

      {list.isSuccess && items.length === 0 && (
        <p className="rounded-2xl border border-dashed border-black/10 px-5 py-10 text-center text-sm text-slate-500 dark:border-white/10">
          {kind === 'followers'
            ? t('follow.emptyFollowers')
            : t('follow.emptyFollowing')}
        </p>
      )}

      {items.length > 0 && (
        <ul className="space-y-1">
          {items.map(({ profile, isFollowing }) => {
            const isMe = profile.id === myId;
            return (
              <li
                key={profile.id}
                className="flex items-center gap-3 rounded-2xl py-2"
              >
                <Link
                  href={isMe ? '/profile' : `/users/${profile.id}`}
                  className="flex min-w-0 flex-1 items-center gap-3 transition hover:opacity-80"
                >
                  <PlaceholderAvatar
                    seed={profile.id}
                    alt={profile.nickname}
                    size={48}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-bold">
                    {profile.nickname}
                  </span>
                  {isMe && (
                    <span className="shrink-0 rounded-full bg-iris/10 px-2 py-0.5 text-[10px] font-bold text-irisl">
                      {t('follow.you')}
                    </span>
                  )}
                </Link>
                {!isMe && (
                  <FollowButton
                    userId={profile.id}
                    isFollowing={isFollowing}
                    kind={kind}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}

      {list.hasNextPage && (
        <button
          type="button"
          disabled={list.isFetchingNextPage}
          onClick={() => void list.fetchNextPage()}
          className="mt-4 w-full rounded-2xl border border-black/10 px-4 py-3 text-sm font-bold transition hover:bg-black/[0.03] disabled:opacity-50 dark:border-white/10 dark:hover:bg-white/[0.05]"
        >
          {list.isFetchingNextPage
            ? t('follow.loadingMore')
            : t('follow.loadMore')}
        </button>
      )}
    </div>
  );
}
