'use client';

import { isApiError } from '@litmatch/api-client';
import Link from 'next/link';
import { useState } from 'react';

import { SearchIcon } from '../../../shared/ui/icons';
import { formatRelativeTime } from '../../../shared/lib/format-relative-time';
import { useFriends } from '../api';
import { FriendAvatar } from './friend-avatar';

import type { FriendDto } from '../api';

export function FriendsList() {
  const friends = useFriends();
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);

  const header = (
    <header className="flex items-center justify-between gap-4 mb-5">
      <h1 className="font-display text-2xl font-semibold italic">Tin nhắn</h1>
      {searchOpen ? (
        <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-full bg-slate-100 px-3 dark:bg-surf2">
          <SearchIcon width={16} height={16} className="shrink-0" />
          <input
            type="search"
            aria-label="Tìm kiếm bạn bè"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onBlur={() => {
              if (search === '') setSearchOpen(false);
            }}
            placeholder="Tìm theo tên…"
            autoFocus
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
          />
        </label>
      ) : (
        <button
          type="button"
          aria-label="Tìm kiếm bạn bè"
          onClick={() => setSearchOpen(true)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-iris/15 hover:text-irisl dark:bg-surf2 dark:text-white"
        >
          <SearchIcon width={16} height={16} />
        </button>
      )}
    </header>
  );

  if (friends.isPending) {
    return (
      <div className="space-y-5">
        {header}
        <p className="text-sm text-slate-500">Đang tải danh sách bạn bè…</p>
      </div>
    );
  }
  if (friends.isError) {
    return (
      <div className="space-y-5">
        {header}
        <p role="alert" className="text-sm text-destructive">
          {isApiError(friends.error)
            ? friends.error.message
            : 'Có lỗi xảy ra, thử lại.'}
        </p>
      </div>
    );
  }

  const allFriends = friends.data ?? [];
  const normalizedSearch = search.trim().toLocaleLowerCase('vi-VN');
  const list = allFriends.filter((friend) =>
    friend.profile.nickname
      .toLocaleLowerCase('vi-VN')
      .includes(normalizedSearch),
  );
  const conversations = list.filter(
    (friend): friend is FriendDto & { lastMessageAt: string } =>
      friend.lastMessageAt !== null,
  );
  const unreadCount = conversations.reduce(
    (total, friend) => total + friend.unreadCount + 1,
    0,
  );

  return (
    <div className="space-y-6 pb-3 md:h-[82vh] md:overflow-y-auto">
      {header}

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

      {list.length > 0 && (
        <section aria-label="Bạn bè">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Bạn bè
            </h2>
          </div>
          <div className="no-scrollbar flex gap-4 overflow-x-auto">
            {list.map((friend) => (
              <Link
                key={friend.conversationId}
                href={`/chat/${friend.profile.id}`}
                className="w-16 shrink-0 text-center"
              >
                <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-irisl to-aqual p-0.5">
                  <FriendAvatar
                    userId={friend.profile.id}
                    nickname={friend.profile.nickname}
                    size={60}
                    className="border-paper dark:border-ink"
                  />
                </span>
                <p className="mt-2 truncate text-[11px] font-semibold">
                  {friend.profile.nickname}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {conversations.length > 0 && (
        <section aria-label="Hội thoại">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
              Hội thoại
            </h2>
            {unreadCount > 0 && (
              <span className="rounded-full bg-iris/10 px-2 py-0.5 text-[10px] font-bold text-irisl">
                {unreadCount} chưa đọc
              </span>
            )}
          </div>
          <ul className="space-y-1">
            {conversations.map((friend) => (
              <li key={friend.conversationId}>
                <Link
                  href={`/chat/${friend.profile.id}`}
                  className="flex items-center gap-3 rounded-2xl py-2 transition hover:bg-black/[0.03] dark:hover:bg-white/[0.05]"
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
                      className={`truncate text-sm ${
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
                    {friend.unreadCount >= 0 && (
                      <span
                        aria-label={`${friend.unreadCount} tin nhắn chưa đọc`}
                        className="flex h-5 min-w-5 items-center justify-center rounded-full bg-irisl px-1.5 text-[10px] font-extrabold text-white"
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
