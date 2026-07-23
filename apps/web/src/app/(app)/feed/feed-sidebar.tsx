'use client';

import Link from 'next/link';

import { FriendAvatar } from '../../../features/friend-chat/components/friend-avatar';
import { useRoomList, useUserProfiles } from '../../../features/party-room/api';

/**
 * Cột phụ bên phải Bảng tin trên desktop (lg+) — đúng bố cục 2-3 cột của Twitter/Facebook/Zalo
 * web thay vì để 1 cột feed hẹp trôi giữa khoảng trắng mênh mông. Ghép dữ liệu Party Room thật
 * (feature khác) ở TẦNG ROUTE — feature không được import feature khác (docs/13 §13.3/12.9),
 * đây là lý do file này nằm cạnh page.tsx thay vì trong features/feed/.
 */
export function FeedSidebar() {
  const rooms = useRoomList();
  const items =
    rooms.data?.pages.flatMap((page) => page?.data ?? []).slice(0, 2) ?? [];
  const hostIds = [...new Set(items.map((room) => room.hostUserId))];
  const hostProfiles = useUserProfiles(hostIds);
  const hostNicknameById = new Map(
    hostIds.map((id, index) => [id, hostProfiles[index]?.data?.nickname]),
  );

  return (
    <aside aria-label="Thông tin bên lề" className="sticky top-6 space-y-4">
      <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm shadow-black/[0.02] dark:border-white/5 dark:bg-surf dark:shadow-black/20">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-bold">Đang trò chuyện</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Party Room nổi bật
            </p>
          </div>
          <Link
            href="/party"
            className="rounded-full bg-iris/10 px-2.5 py-1 text-[11px] font-bold text-irisl"
          >
            Xem tất cả
          </Link>
        </div>
        <ul className="space-y-3">
          {items.length > 0 ? (
            items.map((room) => (
              <li key={room.id}>
                <Link
                  href={`/party/${room.id}`}
                  className="group flex items-center gap-2.5 rounded-xl p-1.5 transition hover:bg-black/5 dark:hover:bg-white/5"
                >
                  <FriendAvatar
                    userId={room.hostUserId}
                    nickname={hostNicknameById.get(room.hostUserId) ?? ''}
                    size={40}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold group-hover:text-irisl">
                      {room.title}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {hostNicknameById.get(room.hostUserId) ?? '…'} ·{' '}
                      {room.memberCount ?? 0} người trong phòng
                    </p>
                  </div>
                </Link>
              </li>
            ))
          ) : (
            <li className="rounded-xl bg-black/[0.03] p-3 text-xs text-slate-500 dark:bg-white/5">
              Chưa có phòng nào đang hoạt động.
            </li>
          )}
        </ul>
      </div>

      <div className="overflow-hidden rounded-2xl border border-black/5 bg-white dark:border-white/5 dark:bg-surf">
        <div className="bg-gradient-to-br from-iris1 to-aqual p-4 rounded-2xl">
          <p className="text-sm font-bold">Tìm một kết nối nghiêm túc?</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
            Xem những người ở gần có cùng mong muốn hẹn hò hoặc tìm bạn đồng
            hành lâu dài.
          </p>
          <Link
            href="/discovery"
            className="mt-3 inline-flex items-center rounded-full bg-foreground px-3 py-1.5 text-xs font-bold text-background transition hover:opacity-85"
          >
            Tìm quanh đây <span aria-hidden>→</span>
          </Link>
        </div>
      </div>
    </aside>
  );
}
