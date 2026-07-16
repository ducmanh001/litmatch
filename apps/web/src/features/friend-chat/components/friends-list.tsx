'use client';

import { isApiError } from '@litmatch/api-client';
import Link from 'next/link';
import { useState } from 'react';

import { useFriends } from '../api';
import { FriendAvatar } from './friend-avatar';

import type { FriendDto } from '../api';

export function FriendsList() {
  const friends = useFriends();
  const [search, setSearch] = useState('');

  if (friends.isPending) {
    return <p className="text-sm text-slate-500">Đang tải danh sách bạn bè…</p>;
  }
  if (friends.isError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {isApiError(friends.error)
          ? friends.error.message
          : 'Có lỗi xảy ra, thử lại.'}
      </p>
    );
  }

  const allFriends = friends.data ?? [];
  const normalizedSearch = search.trim().toLocaleLowerCase('vi-VN');
  const list = allFriends.filter((friend) =>
    friend.profile.nickname
      .toLocaleLowerCase('vi-VN')
      .includes(normalizedSearch),
  );
  const newMatches = list.filter((friend) => friend.lastMessageAt === null);
  const conversations = list.filter(
    (friend): friend is FriendDto & { lastMessageAt: string } =>
      friend.lastMessageAt !== null,
  );

  return (
    <div className="space-y-5">
      <input
        type="search"
        aria-label="Tìm kiếm bạn bè"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Tìm theo tên…"
        className="h-11 w-full rounded-full border border-black/5 bg-white px-4 text-sm outline-none focus:ring-2 focus:ring-iris dark:border-white/10 dark:bg-surf"
      />

      {allFriends.length === 0 && (
        <div className="rounded-2xl border border-dashed border-black/10 px-5 py-10 text-center dark:border-white/10">
          <p className="font-bold">Bạn chưa có kết nối nào</p>
          <p className="mt-1 text-sm text-slate-500">
            Hãy bắt đầu từ Ghép đôi hoặc Quanh đây.
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <Link
              href="/matching"
              className="rounded-full bg-irisl px-4 py-2 text-xs font-bold text-white"
            >
              Ghép đôi
            </Link>
            <Link
              href="/discovery"
              className="rounded-full border border-black/10 px-4 py-2 text-xs font-bold dark:border-white/10"
            >
              Quanh đây
            </Link>
          </div>
        </div>
      )}

      {allFriends.length > 0 && list.length === 0 && (
        <p className="rounded-2xl bg-slate-100 p-5 text-center text-sm text-slate-500 dark:bg-surf2">
          Không tìm thấy người bạn nào.
        </p>
      )}

      {newMatches.length > 0 && (
        <section>
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-400">
            Match mới
          </h2>
          <div className="no-scrollbar flex gap-4 overflow-x-auto pb-1">
            {newMatches.map((friend) => (
              <Link
                key={friend.conversationId}
                href={`/chat/${friend.profile.id}`}
                className="w-16 shrink-0 text-center"
              >
                <FriendAvatar
                  userId={friend.profile.id}
                  nickname={friend.profile.nickname}
                  size={64}
                  className="border-paper dark:border-ink border-2"
                />
                <p className="mt-1.5 truncate text-[11px] font-semibold">
                  {friend.profile.nickname}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {conversations.length > 0 && (
        <section>
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-400">
            Hội thoại
          </h2>
          <ul className="overflow-hidden rounded-2xl border border-border bg-card px-2 dark:border-white/15 dark:bg-surf2/45">
            {conversations.map((friend, index) => (
              <li
                key={friend.conversationId}
                className={index === 0 ? '' : 'border-t border-border'}
              >
                <Link
                  href={`/chat/${friend.profile.id}`}
                  className="flex items-center gap-3 rounded-xl px-2 py-3 hover:bg-muted/70"
                >
                  <FriendAvatar
                    userId={friend.profile.id}
                    nickname={friend.profile.nickname}
                    size={52}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate text-sm font-bold">
                      {friend.profile.nickname}
                      {friend.muted && (
                        <span
                          aria-label="Đã tắt thông báo"
                          title="Đã tắt thông báo"
                          className="text-xs opacity-60"
                        >
                          🔕
                        </span>
                      )}
                    </p>
                    <p
                      className={`truncate text-xs ${
                        friend.unreadCount > 0
                          ? 'font-semibold text-slate-700 dark:text-white/85'
                          : 'text-slate-500'
                      }`}
                    >
                      {/* preview '' = message chỉ có ảnh (content rỗng); null = chưa chat */}
                      {friend.lastMessagePreview || '📷 Ảnh'}
                    </p>
                  </div>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-xs text-slate-400">
                      {formatRelativeTime(friend.lastMessageAt)}
                    </span>
                    {friend.unreadCount > 0 && (
                      <span
                        aria-label={`${friend.unreadCount} tin nhắn chưa đọc`}
                        className="flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-extrabold text-white"
                      >
                        {friend.unreadCount > 99 ? '99+' : friend.unreadCount}
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function formatRelativeTime(iso: string): string {
  const minutes = Math.max(
    0,
    Math.floor((Date.now() - new Date(iso).getTime()) / 60_000),
  );
  if (minutes < 1) return 'Vừa xong';
  if (minutes < 60) return `${minutes} phút`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'Hôm qua' : `${days} ngày`;
}
