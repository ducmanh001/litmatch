'use client';

import { isApiError } from '@litmatch/api-client';
import Link from 'next/link';
import { useState } from 'react';

import { FriendAvatar } from '../../friend-chat/components/friend-avatar';
import { useRoomList, useUserProfiles } from '../api';
import { decorativeListenerCount } from '../decorative-listener-count';
import { CreateRoomForm } from './create-room-form';

import type { PartyRoomDto } from '../api';

function PlusIcon() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      aria-hidden
    >
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Chip lọc theo chủ đề — đúng mockup party-list.html. `PartyRoomDto` không có field
 * category/topic (chưa có ở backend) nên các chip ngoài "Tất cả" chỉ đổi trạng thái active,
 * chưa lọc thật (logic sau khi backend có field).
 */
const CATEGORY_CHIPS = [
  { key: 'all', label: 'Tất cả' },
  { key: 'hot', label: '🔥 Đang hot' },
  { key: 'sing', label: '🎤 Ca hát' },
  { key: 'talk', label: '💬 Tâm sự' },
  { key: 'friend', label: '👋 Kết bạn' },
] as const;

const TRENDING_GRADIENTS = [
  'from-irisl to-aqual',
  'from-surf2 to-surf',
  'from-diamond to-aqual',
];

/** Fallback khi chưa có phòng thật đang mở (dev chưa seed / phòng đã bị sweeper đóng) — demo
 * y hệt layouts/web/party-list.html, không link tới phòng ảo (tránh 404) để không đánh lừa
 * "phòng đang live" khi thực ra không có. */
const FALLBACK_TRENDING = [
  {
    badge: '🔥 Top 1',
    title: 'Tâm sự đêm khuya 🌙',
    host: 'Lan',
    listeners: 24,
  },
  {
    badge: '🎤 Top 2',
    title: 'Hát cho nhau nghe 🎤',
    host: 'Khoa',
    listeners: 41,
  },
  { badge: '👋 Top 3', title: 'Làm quen Sài Gòn', host: 'Vy', listeners: 18 },
];

const FALLBACK_ROOMS = [
  { title: 'Tâm sự đêm khuya 🌙', host: 'Lan', tag: 'Tâm sự', listeners: 24 },
  { title: 'Hát cho nhau nghe 🎤', host: 'Khoa', tag: 'Ca hát', listeners: 41 },
  { title: 'Làm quen Sài Gòn 👋', host: 'Vy', tag: 'Kết bạn', listeners: 18 },
  {
    title: 'Học tiếng Anh cùng nhau 📚',
    host: 'Đạt',
    tag: 'Kết bạn',
    listeners: 12,
  },
  {
    title: 'Beatbox & rap cypher 🔥',
    host: 'Tuấn',
    tag: 'Ca hát',
    listeners: 33,
  },
];

function TrendingCard({
  badge,
  title,
  host,
  listeners,
  gradientClassName,
  href,
}: {
  badge: string;
  title: string;
  host: string;
  listeners: number;
  gradientClassName: string;
  href?: string;
}) {
  const content = (
    <div
      className={`relative flex h-28 w-40 shrink-0 flex-col justify-between overflow-hidden rounded-2xl bg-gradient-to-br p-3 ${gradientClassName}`}
    >
      <span className="self-start rounded-full bg-black/30 px-2 py-0.5 text-[10px] font-extrabold text-white backdrop-blur">
        {badge}
      </span>
      <div>
        <p className="truncate text-sm font-bold text-white">{title}</p>
        <p className="text-[11px] text-white/80">
          {host} · {listeners} nghe
        </p>
      </div>
    </div>
  );
  return href !== undefined ? <Link href={href}>{content}</Link> : content;
}

function FallbackRoomCard({
  title,
  host,
  tag,
  listeners,
}: {
  title: string;
  host: string;
  tag: string;
  listeners: number;
}) {
  return (
    <li>
      <div className="flex items-center gap-3 rounded-2xl border border-black/5 bg-white p-3 opacity-90 dark:border-white/5 dark:bg-surf">
        <div className="relative shrink-0">
          <FriendAvatar userId={host} nickname={host} size={56} />
          <span className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full border-2 border-white bg-emerald-500 dark:border-surf" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">{title}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Host: {host} ·{' '}
            <span className="font-semibold text-irisl">{tag}</span> ·{' '}
            {listeners} nghe
          </p>
        </div>
      </div>
    </li>
  );
}

export function RoomList() {
  const rooms = useRoomList();
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = rooms;
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>('all');

  const items = rooms.data?.pages.flatMap((page) => page?.data ?? []) ?? [];
  const hostIds = [...new Set(items.map((room) => room.hostUserId))];
  const hostProfiles = useUserProfiles(hostIds);
  // useQueries trả kết quả cùng thứ tự với input — map lại theo index để tra cứu O(1).
  const hostNicknameById = new Map(
    hostIds.map((id, index) => [id, hostProfiles[index]?.data?.nickname]),
  );

  const trendingRooms: PartyRoomDto[] = items.slice(0, 3);

  return (
    <div className="relative space-y-5 pb-20">
      <div className="no-scrollbar flex gap-2 overflow-x-auto">
        {CATEGORY_CHIPS.map((chip) => (
          <button
            key={chip.key}
            type="button"
            onClick={() => setActiveCategory(chip.key)}
            className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold ${
              activeCategory === chip.key
                ? 'bg-gradient-to-br from-irisl to-irisl text-white'
                : 'border border-black/5 bg-white dark:border-white/5 dark:bg-surf'
            }`}
          >
            {chip.label}
          </button>
        ))}
      </div>

      <div>
        <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          Nổi bật lúc này
        </p>
        <div className="no-scrollbar flex gap-3 overflow-x-auto">
          {trendingRooms.length > 0
            ? trendingRooms.map((room, index) => (
                <TrendingCard
                  key={room.id}
                  badge={['🔥 Top 1', '🎤 Top 2', '👋 Top 3'][index]}
                  title={room.title}
                  host={hostNicknameById.get(room.hostUserId) ?? '…'}
                  listeners={decorativeListenerCount(room.id)}
                  gradientClassName={TRENDING_GRADIENTS[index]}
                  href={`/party/${room.id}`}
                />
              ))
            : FALLBACK_TRENDING.map((demo, index) => (
                <TrendingCard
                  key={demo.title}
                  badge={demo.badge}
                  title={demo.title}
                  host={demo.host}
                  listeners={demo.listeners}
                  gradientClassName={TRENDING_GRADIENTS[index]}
                />
              ))}
        </div>
      </div>

      {rooms.isPending && (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Đang tải danh sách phòng…
        </p>
      )}

      {rooms.isError && (
        <p role="alert" className="text-sm text-destructive">
          {isApiError(rooms.error)
            ? rooms.error.message
            : 'Có lỗi xảy ra, thử lại.'}
        </p>
      )}

      {!rooms.isPending && !rooms.isError && (
        <div>
          <div className="mb-3 flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
              Đang hoạt động ·{' '}
              {items.length > 0 ? items.length : FALLBACK_ROOMS.length} phòng
            </p>
          </div>
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {items.length > 0
              ? items.map((room) => {
                  const hostNickname = hostNicknameById.get(room.hostUserId);
                  return (
                    <li key={room.id}>
                      <Link
                        href={`/party/${room.id}`}
                        className="flex items-center gap-3 rounded-2xl border border-black/5 bg-white p-3 dark:border-white/5 dark:bg-surf"
                      >
                        <div className="relative shrink-0">
                          {hostNickname !== undefined ? (
                            <FriendAvatar
                              userId={room.hostUserId}
                              nickname={hostNickname}
                              size={56}
                            />
                          ) : (
                            <div className="h-14 w-14 rounded-full bg-slate-100 dark:bg-surf2" />
                          )}
                          <span className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full border-2 border-white bg-emerald-500 dark:border-surf" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold">
                            {room.title}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Host: {hostNickname ?? '…'} · Tối đa{' '}
                            {room.speakerLimit} người nói
                          </p>
                        </div>
                        <p className="shrink-0 text-xs font-extrabold text-emerald-500">
                          ● LIVE
                        </p>
                      </Link>
                    </li>
                  );
                })
              : FALLBACK_ROOMS.map((demo) => (
                  <FallbackRoomCard key={demo.title} {...demo} />
                ))}
          </ul>
        </div>
      )}

      {hasNextPage && (
        <div>
          <button
            type="button"
            className="h-10 w-full rounded-full border border-black/10 text-sm font-bold hover:bg-black/5 disabled:opacity-50 dark:border-white/10 dark:hover:bg-white/5"
            disabled={isFetchingNextPage}
            onClick={() => void fetchNextPage()}
          >
            {isFetchingNextPage ? 'Đang tải…' : 'Xem thêm'}
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={() => setIsCreateOpen(true)}
        className="fixed bottom-24 right-6 z-30 flex items-center gap-2 rounded-full bg-gradient-to-br from-irisl to-irisl px-5 py-3.5 font-bold text-white shadow-xl shadow-iris/30 md:bottom-8"
      >
        <PlusIcon /> Tạo phòng
      </button>

      {isCreateOpen && (
        <div className="fixed inset-0 z-40 flex items-end justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setIsCreateOpen(false)}
          />
          <div className="relative w-full max-w-[430px] rounded-t-3xl bg-white p-6 pb-8 dark:bg-surf">
            <div className="mx-auto mb-5 h-1.5 w-10 rounded-full bg-slate-200 dark:bg-white/10" />
            <p className="mb-4 text-lg font-bold">Tạo phòng mới</p>
            <CreateRoomForm />
          </div>
        </div>
      )}
    </div>
  );
}
