'use client';

import { isApiError } from '@litmatch/api-client';
import Link from 'next/link';
import { useState } from 'react';

import { FriendAvatar } from '../../friend-chat/components/friend-avatar';
import { useRoomList, useUserProfiles } from '../api';
import { CreateRoomForm } from './create-room-form';

import type { PartyRoomDto } from '../api';

const CATEGORY_CHIPS = [
  { key: 'all', label: 'Tất cả' },
  { key: 'talk', label: '💬 Tâm sự' },
  { key: 'sing', label: '🎤 Ca hát' },
  { key: 'friend', label: '👋 Kết bạn' },
  { key: 'study', label: '📚 Học tập' },
  { key: 'other', label: '✨ Khác' },
] as const;

const CATEGORY_LABEL: Record<PartyRoomDto['category'], string> = {
  talk: 'Tâm sự',
  sing: 'Ca hát',
  friend: 'Kết bạn',
  study: 'Học tập',
  other: 'Khác',
};

const TRENDING_GRADIENTS = [
  'from-irisl to-aqual',
  'from-surf2 to-surf',
  'from-diamond to-aqual',
];

export function RoomList() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] =
    useState<(typeof CATEGORY_CHIPS)[number]['key']>('all');
  const rooms = useRoomList({
    q: query.trim() || undefined,
    category: activeCategory === 'all' ? undefined : activeCategory,
  });
  const items = rooms.data?.pages.flatMap((page) => page?.data ?? []) ?? [];
  const hostIds = [...new Set(items.map((room) => room.hostUserId))];
  const hostProfiles = useUserProfiles(hostIds);
  const hostNicknameById = new Map(
    hostIds.map((id, index) => [id, hostProfiles[index]?.data?.nickname]),
  );

  return (
    <div className="relative space-y-5 pb-20">
      <input
        type="search"
        aria-label="Tìm kiếm phòng"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Tìm theo tên phòng…"
        className="h-11 w-full rounded-full border border-black/5 bg-white px-4 text-sm outline-none focus:ring-2 focus:ring-iris dark:border-white/5 dark:bg-surf"
      />

      <div
        className="no-scrollbar flex gap-2 overflow-x-auto"
        aria-label="Lọc chủ đề phòng"
      >
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

      {rooms.isPending && (
        <p className="text-sm text-slate-500">Đang tải danh sách phòng…</p>
      )}
      {rooms.isError && (
        <p role="alert" className="text-sm text-destructive">
          {isApiError(rooms.error)
            ? rooms.error.message
            : 'Có lỗi xảy ra, thử lại.'}
        </p>
      )}

      {!rooms.isPending && !rooms.isError && items.length === 0 && (
        <div className="rounded-2xl border border-dashed border-black/10 px-5 py-10 text-center dark:border-white/10">
          <p className="font-bold">Không có phòng nào phù hợp</p>
          <p className="mt-1 text-sm text-slate-500">
            Thử chủ đề khác hoặc tự tạo phòng mới.
          </p>
        </div>
      )}

      {items.length > 0 && (
        <>
          <section>
            <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-400">
              Mới mở
            </p>
            <div className="no-scrollbar flex gap-3 overflow-x-auto">
              {items.slice(0, 3).map((room, index) => (
                <Link
                  key={room.id}
                  href={`/party/${room.id}`}
                  className={`flex h-28 w-40 shrink-0 flex-col justify-between rounded-2xl bg-gradient-to-br p-3 ${TRENDING_GRADIENTS[index]}`}
                >
                  <span className="self-start rounded-full bg-black/30 px-2 py-0.5 text-[10px] font-extrabold text-white">
                    {CATEGORY_LABEL[room.category]}
                  </span>
                  <div>
                    <p className="truncate text-sm font-bold text-white">
                      {room.title}
                    </p>
                    <p className="text-[11px] text-white/80">
                      {hostNicknameById.get(room.hostUserId) ?? '…'} ·{' '}
                      {room.memberCount ?? 0} người
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </section>

          <section>
            <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-400">
              Đang hoạt động · {items.length} phòng đã tải
            </p>
            <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {items.map((room) => {
                const hostNickname = hostNicknameById.get(room.hostUserId);
                return (
                  <li key={room.id}>
                    <Link
                      href={`/party/${room.id}`}
                      className="flex items-center gap-3 rounded-2xl border border-black/5 bg-white p-3 dark:border-white/5 dark:bg-surf"
                    >
                      {hostNickname !== undefined ? (
                        <FriendAvatar
                          userId={room.hostUserId}
                          nickname={hostNickname}
                          size={56}
                        />
                      ) : (
                        <div className="h-14 w-14 shrink-0 rounded-full bg-slate-100 dark:bg-surf2" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold">
                          {room.title}
                        </p>
                        <p className="text-xs text-slate-500">
                          {hostNickname ?? '…'} ·{' '}
                          {CATEGORY_LABEL[room.category]} ·{' '}
                          {room.memberCount ?? 0} người
                        </p>
                      </div>
                      <span className="text-xs font-extrabold text-emerald-500">
                        ● LIVE
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}

      {rooms.hasNextPage && (
        <button
          type="button"
          className="h-10 w-full rounded-full border border-black/10 text-sm font-bold disabled:opacity-50 dark:border-white/10"
          disabled={rooms.isFetchingNextPage}
          onClick={() => void rooms.fetchNextPage()}
        >
          {rooms.isFetchingNextPage ? 'Đang tải…' : 'Xem thêm'}
        </button>
      )}

      <button
        type="button"
        onClick={() => setIsCreateOpen(true)}
        className="fixed bottom-24 right-6 z-30 rounded-full bg-gradient-to-br from-irisl to-irisl px-5 py-3.5 font-bold text-white shadow-xl md:bottom-8"
      >
        ＋ Tạo phòng
      </button>

      {isCreateOpen && (
        <div className="fixed inset-0 z-40 flex items-end justify-center">
          <button
            type="button"
            aria-label="Đóng"
            className="absolute inset-0 bg-black/50"
            onClick={() => setIsCreateOpen(false)}
          />
          <div className="relative w-full max-w-[430px] rounded-t-3xl bg-white p-6 pb-8 dark:bg-surf">
            <p className="mb-4 text-lg font-bold">Tạo phòng mới</p>
            <CreateRoomForm />
          </div>
        </div>
      )}
    </div>
  );
}
