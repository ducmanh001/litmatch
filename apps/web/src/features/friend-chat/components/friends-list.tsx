'use client';

import { isApiError } from '@litmatch/api-client';
import Link from 'next/link';

import { useFriends } from '../api';
import { FriendAvatar } from './friend-avatar';

import type { FriendDto } from '../api';

/**
 * Không có field "unreadCount"/"isOnline" ở FriendDto (docs/13 §13.1: FE không tự bịa state
 * không có thật) nên bỏ badge chưa-đọc + chấm online trong mockup. lastMessageAt !== null vẫn
 * là dữ liệu thật từ server nên dùng được để suy ra khoảng thời gian tương đối hiển thị.
 */
function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'Vừa xong';
  if (minutes < 60) return `${minutes} phút`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Hôm qua';
  if (days < 7) return `${days} ngày`;
  return new Date(iso).toLocaleDateString('vi-VN');
}

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

  // "Match mới" trong mockup là nhóm bạn chưa từng nhắn tin (khác nhóm "Hội thoại" phía dưới) —
  // suy ra được từ lastMessageAt === null, là dữ liệu thật của FriendDto, không phải state bịa.
  const newMatches = list.filter((friend) => friend.lastMessageAt === null);
  const conversations = list.filter(
    (friend): friend is FriendDto & { lastMessageAt: string } =>
      friend.lastMessageAt !== null,
  );

  return (
    <div>
      {newMatches.length > 0 && (
        <div className="mb-5">
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            Match mới
          </p>
          <div className="no-scrollbar flex gap-4 overflow-x-auto pb-1">
            {newMatches.map((friend) => (
              <Link
                key={friend.conversationId}
                href={`/chat/${friend.profile.id}`}
                className="w-16 shrink-0 text-center"
              >
                <div className="rounded-full bg-gradient-to-br from-irisl to-aqual p-0.5">
                  <FriendAvatar
                    userId={friend.profile.id}
                    nickname={friend.profile.nickname}
                    size={64}
                  />
                </div>
                <p className="mt-1.5 truncate text-[11px] font-semibold">
                  {friend.profile.nickname}
                </p>
              </Link>
            ))}
          </div>
        </div>
      )}
      {conversations.length > 0 && (
        <div>
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            Hội thoại
          </p>
          <ul className="space-y-1">
            {conversations.map((friend) => (
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
                      Nhắn gần nhất{' '}
                      {new Date(friend.lastMessageAt).toLocaleDateString(
                        'vi-VN',
                      )}
                    </p>
                  </div>
                  <p className="shrink-0 text-xs text-slate-400">
                    {formatRelativeTime(friend.lastMessageAt)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
