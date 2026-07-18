'use client';

import Link from 'next/link';

import { useTranslation } from '../../../shared/i18n/messages';
import { PlaceholderAvatar } from '../../../shared/ui/placeholder-avatar';
import { useRoomList } from '../api';

import type { ReactNode } from 'react';

function RoomCards({ children }: { children: ReactNode }) {
  return (
    <div className="no-scrollbar flex snap-x gap-3 overflow-x-auto px-5 pb-5 sm:grid sm:grid-cols-2 sm:overflow-visible lg:grid-cols-2 xl:grid-cols-3">
      {children}
    </div>
  );
}

export function TrendingRoomCards() {
  const t = useTranslation();
  const { data, isPending, isError, refetch } = useRoomList();
  const rooms =
    data?.pages.flatMap((page) => page?.data ?? []).slice(0, 6) ?? [];

  if (isPending) {
    return (
      <RoomCards>
        {[0, 1, 2].map((item) => (
          <div
            key={item}
            className="h-36 w-52 shrink-0 animate-pulse snap-start rounded-2xl bg-muted sm:w-auto"
          />
        ))}
      </RoomCards>
    );
  }

  if (isError) {
    return (
      <div className="mx-5 mb-5 rounded-2xl bg-muted p-4" role="alert">
        <p className="text-sm font-semibold">{t('home.roomsLoadError')}</p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="mt-2 text-xs font-bold text-irisl dark:text-white"
        >
          {t('home.retry')}
        </button>
      </div>
    );
  }

  if (rooms.length === 0) {
    return (
      <div className="mx-5 mb-5 rounded-2xl border border-dashed border-black/10 p-5 text-sm text-muted-foreground dark:border-white/10">
        {t('home.roomsEmpty')}
      </div>
    );
  }

  return (
    <RoomCards>
      {rooms.map((room) => (
        <Link
          key={room.id}
          href={`/party/${room.id}`}
          className="w-52 shrink-0 snap-start rounded-2xl border border-black/5 bg-slate-50/80 p-4 transition hover:-translate-y-0.5 hover:border-iris/30 sm:w-auto dark:border-white/10 dark:bg-white/5"
        >
          <div className="flex items-start justify-between gap-3">
            <PlaceholderAvatar
              seed={room.id}
              size={32}
              className="border-2 border-card"
            />
            <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/40" />
          </div>
          <div className="mt-5">
            <p className="line-clamp-2 text-sm font-bold leading-snug">
              {room.title}
            </p>
            <p className="mt-1 text-xs text-muted-foreground dark:text-white/60">
              {room.memberCount ?? 0} {t('home.roomListeners')}
            </p>
          </div>
        </Link>
      ))}
    </RoomCards>
  );
}
