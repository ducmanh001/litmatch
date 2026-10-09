'use client';

import { isApiError } from '@litmatch/api-client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { useCurrentUser } from '../../../shared/auth/use-current-user';
import { useTranslation } from '../../../shared/i18n/messages';
import { showToast } from '../../../shared/lib/toast-store';
import { FriendsIcon, UsersIcon } from '../../../shared/ui/icons';
import { useOpenProfileConversation } from '../../profile/api';
import { useFriendConnections, useFriends } from '../api';
import { FriendAvatar } from './friend-avatar';

import type { ReactNode } from 'react';

const SHORTCUT_CLASS =
  'flex flex-col items-center gap-1.5 rounded-2xl border border-black/5 bg-white px-2 py-3 text-center text-[11px] font-bold transition hover:bg-black/[0.03] dark:border-white/5 dark:bg-surf dark:hover:bg-white/[0.05]';

function Shortcut({
  href,
  icon,
  label,
  badge,
}: {
  href: string;
  icon: ReactNode;
  label: string;
  badge?: number;
}) {
  return (
    <Link href={href} className={`relative ${SHORTCUT_CLASS}`}>
      <span className="text-irisl">{icon}</span>
      <span className="truncate">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="absolute right-2 top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-irisl px-1 text-[9px] font-extrabold text-white">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </Link>
  );
}

/**
 * "Nhắn tin" cho bạn bè: mở (hoặc lấy lại) conversation qua hồ sơ rồi vào chat. Bạn bè do follow
 * chéo có thể chưa từng chat nên không thể link thẳng `/chat/:id`; conversation đã có thì server
 * trả lại ngay, kể cả khi hồ sơ đang vượt ngưỡng first-chat.
 */
function MessageButton({
  userId,
  nickname,
}: {
  userId: string;
  nickname: string;
}) {
  const t = useTranslation();
  const router = useRouter();
  const openConversation = useOpenProfileConversation(userId);

  const open = () =>
    openConversation.mutate(undefined, {
      onSuccess: () => router.push(`/chat/${userId}`),
      onError: (error) => {
        showToast(
          isApiError(error) ? error.message : t('friendsPage.openError'),
          'warn',
        );
        // Hồ sơ đang quá hot: tặng quà để mở chat nằm ở trang hồ sơ.
        if (isApiError(error) && error.status === 402) {
          router.push(`/users/${userId}`);
        }
      },
    });

  return (
    <button
      type="button"
      onClick={open}
      disabled={openConversation.isPending}
      aria-label={t('friendsPage.messageTo', { name: nickname })}
      className="shrink-0 rounded-full bg-irisl px-4 py-2 text-xs font-bold text-white transition hover:brightness-105 disabled:opacity-50"
    >
      {t('friendsPage.message')}
    </button>
  );
}

/**
 * Danh sách bạn bè = cùng "Thích" lúc ghép đôi hoặc follow nhau hai chiều — khác Tin nhắn
 * (`/messages`) là inbox mọi hội thoại. Từ đây đi tiếp tới hồ sơ, nhắn tin, và danh sách
 * follower/following của chính mình.
 */
export function FriendsDirectory() {
  const t = useTranslation();
  const connections = useFriendConnections();
  // Inbox chỉ dùng để đếm tin chưa đọc cho lối tắt Tin nhắn.
  const inbox = useFriends();
  const currentUser = useCurrentUser();
  const myId = currentUser.data?.id;

  const friendList = connections.data ?? [];
  const unreadCount = (inbox.data ?? []).reduce(
    (total, friend) => total + friend.unreadCount,
    0,
  );

  return (
    <div className="space-y-6 px-4 pb-8">
      <header className="flex items-end justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold italic">
          {t('friendsPage.title')}
        </h1>
        {connections.isSuccess && (
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            {t('friendsPage.count', { count: friendList.length })}
          </p>
        )}
      </header>

      <nav
        aria-label={t('friendsPage.shortcuts')}
        className="grid grid-cols-3 gap-2.5"
      >
        <Shortcut
          href="/messages"
          icon={<FriendsIcon width={20} height={20} />}
          label={t('friendsPage.messages')}
          badge={unreadCount}
        />
        {myId !== undefined && (
          <>
            <Shortcut
              href={`/users/${myId}/followers`}
              icon={<UsersIcon width={20} height={20} />}
              label={t('friendsPage.followers')}
            />
            <Shortcut
              href={`/users/${myId}/following`}
              icon={<UsersIcon width={20} height={20} />}
              label={t('friendsPage.following')}
            />
          </>
        )}
      </nav>

      {connections.isPending && (
        <p className="text-sm text-slate-500">{t('friendsPage.loading')}</p>
      )}

      {connections.isError && (
        <p role="alert" className="text-sm text-destructive">
          {isApiError(connections.error)
            ? connections.error.message
            : t('common.somethingWentWrong')}
        </p>
      )}

      {connections.isSuccess && friendList.length === 0 && (
        <div className="rounded-2xl border border-dashed border-black/10 px-5 py-10 text-center dark:border-white/10">
          <p className="font-bold">{t('friendsPage.emptyTitle')}</p>
          <p className="mt-1 text-sm text-slate-500">
            {t('friendsPage.emptyDescription')}
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <Link
              href="/matching"
              className="rounded-full bg-irisl px-4 py-2 text-xs font-bold text-white"
            >
              {t('friends.matching')}
            </Link>
            <Link
              href="/discovery"
              className="rounded-full border border-black/10 px-4 py-2 text-xs font-bold dark:border-white/10"
            >
              {t('friends.nearby')}
            </Link>
          </div>
        </div>
      )}

      {friendList.length > 0 && (
        <ul className="space-y-1">
          {friendList.map((friend) => (
            <li
              key={friend.profile.id}
              className="flex items-center gap-3 rounded-2xl py-2"
            >
              <Link
                href={`/users/${friend.profile.id}`}
                aria-label={t('friendsPage.viewProfile', {
                  name: friend.profile.nickname,
                })}
                className="flex min-w-0 flex-1 items-center gap-3 transition hover:opacity-80"
              >
                <FriendAvatar
                  userId={friend.profile.id}
                  nickname={friend.profile.nickname}
                  size={52}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">
                    {friend.profile.nickname}
                  </span>
                  <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">
                    {friend.isFriend
                      ? t('friendsPage.viaMatch')
                      : t('friendsPage.viaFollow')}
                  </span>
                </span>
              </Link>
              <MessageButton
                userId={friend.profile.id}
                nickname={friend.profile.nickname}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
