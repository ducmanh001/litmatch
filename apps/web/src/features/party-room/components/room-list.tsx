'use client';

import { isApiError } from '@litmatch/api-client';
import Link from 'next/link';

import { useRoomList, useUserProfiles } from '../api';
import { CreateRoomForm } from './create-room-form';

export function RoomList() {
  const rooms = useRoomList();
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = rooms;

  const items = rooms.data?.pages.flatMap((page) => page?.data ?? []) ?? [];
  const hostIds = [...new Set(items.map((room) => room.hostUserId))];
  const hostProfiles = useUserProfiles(hostIds);
  // useQueries trả kết quả cùng thứ tự với input — map lại theo index để tra cứu O(1).
  const hostNicknameById = new Map(
    hostIds.map((id, index) => [id, hostProfiles[index]?.data?.nickname]),
  );

  return (
    <div className="space-y-4">
      <CreateRoomForm />

      {rooms.isPending && (
        <p className="text-sm text-muted-foreground">
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

      {!rooms.isPending && !rooms.isError && items.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Chưa có phòng nào đang mở — tạo phòng mới để bắt đầu.
        </p>
      )}

      {items.length > 0 && (
        <ul className="divide-y divide-border">
          {items.map((room) => (
            <li key={room.id}>
              <Link
                href={`/party/${room.id}`}
                className="block py-3 hover:bg-card"
              >
                <p className="text-sm font-medium">{room.title}</p>
                <p className="text-xs text-muted-foreground">
                  Host: {hostNicknameById.get(room.hostUserId) ?? '…'} · Tối đa{' '}
                  {room.speakerLimit} người nói
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {hasNextPage && (
        <button
          type="button"
          className="h-9 w-full rounded-md border border-border text-sm hover:bg-card disabled:opacity-50"
          disabled={isFetchingNextPage}
          onClick={() => void fetchNextPage()}
        >
          {isFetchingNextPage ? 'Đang tải…' : 'Xem thêm'}
        </button>
      )}
    </div>
  );
}
