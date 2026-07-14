'use client';

import { isApiError } from '@litmatch/api-client';
import Link from 'next/link';

import { useFriends } from '../api';
import { FriendAvatar } from './friend-avatar';

export function FriendsList() {
  const friends = useFriends();

  if (friends.isPending) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Đang tải danh sách bạn bè…
      </p>
    );
  }

  if (friends.isError) {
    const message = isApiError(friends.error)
      ? friends.error.message
      : 'Có lỗi xảy ra, thử lại.';
    return (
      <p role="alert" className="text-sm text-destructive">
        {message}
      </p>
    );
  }

  const list = friends.data ?? [];

  if (list.length === 0) {
    return (
      <div className="space-y-2 rounded-2xl border border-black/5 bg-white px-4 py-6 text-center dark:border-white/10 dark:bg-surf">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Chưa có bạn bè — ghép đôi để kết bạn.
        </p>
        <Link href="/matching" className="text-sm font-bold text-irisl">
          Tìm ghép đôi
        </Link>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-black/5 dark:divide-white/10">
      {list.map((friend) => (
        <li key={friend.conversationId}>
          <Link
            href={`/chat/${friend.profile.id}`}
            className="flex items-center gap-3 py-3"
          >
            <FriendAvatar
              userId={friend.profile.id}
              nickname={friend.profile.nickname}
              size={52}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">
                {friend.profile.nickname}
              </p>
              <p className="truncate text-sm text-slate-500 dark:text-slate-400">
                {friend.lastMessageAt !== null
                  ? `Nhắn gần nhất ${new Date(friend.lastMessageAt).toLocaleDateString('vi-VN')}`
                  : `Bạn từ ${new Date(friend.friendSince).toLocaleDateString('vi-VN')}`}
              </p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
