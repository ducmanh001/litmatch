'use client';

import { isApiError } from '@litmatch/api-client';
import Link from 'next/link';

import { useFriends } from '../api';
import { FriendAvatar } from './friend-avatar';

export function FriendsList() {
  const friends = useFriends();

  if (friends.isPending) {
    return (
      <p className="text-sm text-muted-foreground">
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
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          Chưa có bạn bè — ghép đôi để kết bạn.
        </p>
        <Link href="/matching" className="text-sm text-primary underline">
          Tìm ghép đôi
        </Link>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border">
      {list.map((friend) => (
        <li key={friend.conversationId}>
          <Link
            href={`/chat/${friend.profile.id}`}
            className="flex items-center gap-3 py-3 hover:bg-card"
          >
            <FriendAvatar
              userId={friend.profile.id}
              nickname={friend.profile.nickname}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {friend.profile.nickname}
              </p>
              <p className="truncate text-xs text-muted-foreground">
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
