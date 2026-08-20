'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { BellIcon } from '../../../shared/ui/icons';
import { formatRelativeTime } from '../../../shared/lib/format-relative-time';
import { useLocale } from '../../../shared/i18n/locale-store';
import { useTranslation } from '../../../shared/i18n/messages';
import {
  useMarkNotificationRead,
  useNotifications,
  useUnreadNotificationCount,
} from '../api';
import { presentNotification } from '../notification-copy';
import { enableWebPush, getWebPushStatus } from '../web-push';

import type { WebPushStatus } from '../web-push';

import type { NotificationDto } from '../api';

function NotificationItem({
  notification,
  onNavigate,
}: {
  notification: NotificationDto;
  onNavigate: (href: string | null) => void;
}) {
  const markRead = useMarkNotificationRead();
  const locale = useLocale();
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
            {formatRelativeTime(notification.createdAt, locale)}
          </span>
        </span>
      </button>
    </li>
  );
}

function NotificationPanel({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const t = useTranslation();
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
      aria-label={t('notifications.title')}
      className="absolute right-0 top-12 z-50 w-80 max-w-[calc(100vw-2.5rem)] overflow-hidden rounded-2xl border border-black/10 bg-white shadow-2xl shadow-black/10 dark:border-white/10 dark:bg-surf"
    >
      <p className="border-b border-black/5 px-4 py-3 text-sm font-extrabold dark:border-white/5">
        {t('notifications.title')}
      </p>
      <BrowserPushControl />

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
          <p className="text-sm font-semibold">
            {t('notifications.loadingError')}
          </p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-2 text-xs font-bold text-irisl"
          >
            Thử lại
          </button>
        </div>
      )}

      {!isPending && !isError && items.length === 0 && (
        <p className="p-4 text-sm text-muted-foreground dark:text-white/65">
          {t('notifications.empty')}
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
          className="w-full border-t border-black/5 px-4 py-2.5 text-xs font-bold text-irisl disabled:opacity-50 dark:border-white/5"
        >
          {isFetchingNextPage ? t('common.loading') : t('common.viewMore')}
        </button>
      )}
    </div>
  );
}

function BrowserPushControl() {
  const t = useTranslation();
  const [status, setStatus] = useState<WebPushStatus>('checking');

  useEffect(() => {
    let mounted = true;
    void getWebPushStatus().then((next) => {
      if (mounted) setStatus(next);
    });
    return () => {
      mounted = false;
    };
  }, []);

  if (
    status === 'checking' ||
    status === 'unsupported' ||
    status === 'unconfigured'
  )
    return null;
  if (status === 'enabled') {
    return (
      <p className="border-b border-black/5 px-4 py-2 text-[11px] font-semibold text-emerald-600 dark:border-white/5 dark:text-emerald-300">
        ✓ {t('notifications.browserPushEnabled')}
      </p>
    );
  }
  if (status === 'denied') {
    return (
      <p className="border-b border-black/5 px-4 py-2 text-[11px] text-muted-foreground dark:border-white/5 dark:text-white/55">
        {t('notifications.browserPushDenied')}
      </p>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        void enableWebPush()
          .then(setStatus)
          .catch(() => setStatus('default'));
      }}
      className="flex w-full items-center gap-2 border-b border-black/5 px-4 py-2.5 text-left text-xs font-bold text-irisl hover:bg-iris/5 dark:border-white/5"
    >
      🔔 {t('notifications.enableBrowserPush')}
    </button>
  );
}

/** Chuông thông báo (top bar home.html): badge chưa đọc + panel danh sách, mark-read khi bấm. */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const t = useTranslation();
  const { data: unread } = useUnreadNotificationCount();
  const unreadCount = unread?.count ?? 0;

  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-label={
          unreadCount > 0
            ? t('notifications.unread', { count: unreadCount })
            : t('notifications.title')
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
            aria-label={t('notifications.close')}
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
