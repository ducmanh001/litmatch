'use client';

import { isApiError } from '@litmatch/api-client';
import Link from 'next/link';
import { useState } from 'react';

import { FriendAvatar } from '../../friend-chat/components/friend-avatar';
import { useRoomList, useUserProfiles } from '../api';
import { CreateRoomForm } from './create-room-form';

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

export function RoomList() {
  const rooms = useRoomList();
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = rooms;
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const items = rooms.data?.pages.flatMap((page) => page?.data ?? []) ?? [];
  const hostIds = [...new Set(items.map((room) => room.hostUserId))];
  const hostProfiles = useUserProfiles(hostIds);
  // useQueries trả kết quả cùng thứ tự với input — map lại theo index để tra cứu O(1).
  const hostNicknameById = new Map(
    hostIds.map((id, index) => [id, hostProfiles[index]?.data?.nickname]),
  );

  return (
    <div className="relative space-y-5 pb-20">
      {rooms.isPending && (
        <p className="px-5 text-sm text-slate-500 dark:text-slate-400">
          Đang tải danh sách phòng…
        </p>
      )}

      {rooms.isError && (
        <p role="alert" className="px-5 text-sm text-destructive">
          {isApiError(rooms.error)
            ? rooms.error.message
            : 'Có lỗi xảy ra, thử lại.'}
        </p>
      )}

      {!rooms.isPending && !rooms.isError && items.length === 0 && (
        <p className="px-5 text-sm text-slate-500 dark:text-slate-400">
          Chưa có phòng nào đang mở — tạo phòng mới để bắt đầu.
        </p>
      )}

      {items.length > 0 && (
        <div>
          <div className="mb-3 flex items-center gap-2 px-5">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
              Đang hoạt động · {items.length} phòng
            </p>
          </div>
          <ul className="grid grid-cols-1 gap-3 px-5 md:grid-cols-2 lg:grid-cols-3">
            {items.map((room) => {
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
                      <p className="truncate text-sm font-bold">{room.title}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Host: {hostNickname ?? '…'} · Tối đa {room.speakerLimit}{' '}
                        người nói
                      </p>
                    </div>
                    <p className="shrink-0 text-xs font-extrabold text-emerald-500">
                      ● LIVE
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {hasNextPage && (
        <div className="px-5">
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
