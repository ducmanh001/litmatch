'use client';

import Link from 'next/link';

import { useCurrentUser } from '../../../shared/auth/use-current-user';
import { useFriendConnections } from '../../friend-chat/api';
import { useWallet } from '../../wallet/api';
import { useTranslation } from '../../../shared/i18n/messages';
import { useFollowCounts } from '../api';

import type { ReactNode } from 'react';

const TILE_CLASS =
  'rounded-2xl border border-black/5 bg-white py-3 text-center dark:border-white/5 dark:bg-surf';

function StatTile({
  href,
  value,
  label,
  valueClassName = '',
}: {
  href: string;
  value: ReactNode;
  label: string;
  valueClassName?: string;
}) {
  return (
    <Link href={href} className={TILE_CLASS}>
      <p className={`text-sm font-extrabold ${valueClassName}`}>{value}</p>
      <p className="text-[11px] text-slate-500 dark:text-slate-400">{label}</p>
    </Link>
  );
}

/**
 * Không có endpoint tổng số bài viết (PostsPageDto chỉ có cursor pagination, không có
 * total) — chỉ hiển thị số thật: Diamond (ví), Bạn bè (ghép đôi hoặc follow chéo),
 * Người theo dõi / Đang theo dõi (follow-counts). Không dựng số "Bài viết" giả bằng độ dài
 * trang đầu tiên; số nào chưa tải được thì ẩn ô đó.
 */
export function ProfileStats() {
  const wallet = useWallet();
  const connections = useFriendConnections();
  const currentUser = useCurrentUser();
  const myId = currentUser.data?.id ?? '';
  const followCounts = useFollowCounts(myId);
  const t = useTranslation();

  const balance = wallet.data?.balance;
  const friendCount = Array.isArray(connections.data)
    ? connections.data.length
    : undefined;
  const followerCount = followCounts.data?.followerCount;
  const followingCount = followCounts.data?.followingCount;

  if (
    balance === undefined &&
    friendCount === undefined &&
    followerCount === undefined &&
    followingCount === undefined
  ) {
    return null;
  }

  return (
    <div className="mb-6 grid grid-cols-2 gap-3">
      {balance !== undefined && (
        <StatTile
          href="/wallet"
          value={balance}
          label="Diamond"
          valueClassName="text-sky-600 dark:text-diamond"
        />
      )}
      {friendCount !== undefined && (
        <StatTile
          href="/friends"
          value={friendCount}
          label={t('profile.friends')}
        />
      )}
      {followerCount !== undefined && (
        <StatTile
          href={`/users/${myId}/followers`}
          value={followerCount.toLocaleString('vi-VN')}
          label={t('follow.followers')}
        />
      )}
      {followingCount !== undefined && (
        <StatTile
          href={`/users/${myId}/following`}
          value={followingCount.toLocaleString('vi-VN')}
          label={t('follow.following')}
        />
      )}
    </div>
  );
}
