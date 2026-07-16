'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { BellIcon } from '../../../shared/ui/icons';
import { formatRelativeTime } from '../../../shared/lib/format-relative-time';
import {
  useMarkNotificationRead,
  useNotifications,
  useUnreadNotificationCount,
} from '../api';
import { presentNotification } from '../notification-copy';

import type { NotificationDto } from '../api';

function NotificationItem({
  notification,
  onNavigate,
}: {
  notification: NotificationDto;
  onNavigate: (href: string | null) => void;
}) {
  const markRead = useMarkNotificationRead();
  const { title, body, href } = presentNotification(notification);
  const unread = notification.readAt == null;

  return (
    <li>
      <button
        type="button"
        onClick={() => {
          // Mark-read idempotent phía server — bấm lại item đã đọc chỉ điều hướng.
          if (unread) markRead.mutate(notification.id);
          onNavigate(href);
        }}
        className={`flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-black/5 dark:hover:bg-white/5 ${
          unread ? 'bg-iris/5 dark:bg-white/5' : ''
        }`}
      >
        <span
          aria-hidden
          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
            unread ? 'bg-rose-500' : 'bg-transparent'
          }`}
        />
        <span className="min-w-0">
          <span className="block text-sm font-bold leading-snug">{title}</span>
          {body && (
            <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground dark:text-white/65">
              {body}
            </span>
          )}
          <span className="mt-1 block text-[11px] text-slate-400 dark:text-white/45">
            {formatRelativeTime(notification.createdAt)}
          </span>
        </span>
      </button>
    </li>
  );
}

function NotificationPanel({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const {
    data,
    isPending,
    isError,
    refetch,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useNotifications(true);

  const items = data?.pages.flatMap((page) => page?.items ?? []) ?? [];

  const handleNavigate = (href: string | null) => {
    onClose();
    if (href) router.push(href);
  };

  return (
    <div
      role="dialog"
      aria-label="Thông báo"
      className="absolute right-0 top-12 z-50 w-80 max-w-[calc(100vw-2.5rem)] overflow-hidden rounded-2xl border border-black/10 bg-white shadow-2xl shadow-black/10 dark:border-white/10 dark:bg-surf"
    >
      <p className="border-b border-black/5 px-4 py-3 text-sm font-extrabold dark:border-white/5">
        Thông báo
      </p>

      {isPending && (
        <div className="space-y-3 p-4">
          {[0, 1, 2].map((row) => (
            <div
              key={row}
              className="h-10 animate-pulse rounded-xl bg-muted dark:bg-white/5"
            />
          ))}
        </div>
      )}

      {isError && (
        <div className="p-4" role="alert">
          <p className="text-sm font-semibold">Không tải được thông báo.</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-2 text-xs font-bold text-rose-700 dark:text-irisl"
          >
            Thử lại
          </button>
        </div>
      )}

      {!isPending && !isError && items.length === 0 && (
        <p className="p-4 text-sm text-muted-foreground dark:text-white/65">
          Chưa có thông báo nào.
        </p>
      )}

      {items.length > 0 && (
        <ul className="max-h-96 divide-y divide-black/5 overflow-y-auto dark:divide-white/5">
          {items.map((notification) => (
            <NotificationItem
              key={notification.id}
              notification={notification}
              onNavigate={handleNavigate}
            />
          ))}
        </ul>
      )}

      {hasNextPage && (
        <button
          type="button"
          disabled={isFetchingNextPage}
          onClick={() => void fetchNextPage()}
          className="w-full border-t border-black/5 px-4 py-2.5 text-xs font-bold text-rose-700 disabled:opacity-50 dark:border-white/5 dark:text-irisl"
        >
          {isFetchingNextPage ? 'Đang tải…' : 'Xem thêm'}
        </button>
      )}
    </div>
  );
}

/** Chuông thông báo (top bar home.html): badge chưa đọc + panel danh sách, mark-read khi bấm. */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const { data: unread } = useUnreadNotificationCount();
  const unreadCount = unread?.count ?? 0;

  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-label={
          unreadCount > 0 ? `Thông báo, ${unreadCount} chưa đọc` : 'Thông báo'
        }
        onClick={() => setOpen((value) => !value)}
        className="relative flex h-10 w-10 items-center justify-center rounded-full border border-black/5 bg-white text-slate-600 transition hover:border-iris/30 dark:border-white/10 dark:bg-surf dark:text-white/80"
      >
        <BellIcon width={17} height={17} />
        {unreadCount > 0 && (
          <span
            aria-hidden
            className="absolute right-1.5 top-1.5 flex h-2 w-2 rounded-full bg-rose-500"
          />
        )}
      </button>

      {open && (
        <>
          {/* Backdrop bắt click ra ngoài để đóng panel — không chặn scroll trang. */}
          <button
            type="button"
            aria-label="Đóng thông báo"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <NotificationPanel onClose={() => setOpen(false)} />
        </>
      )}
    </div>
  );
}
