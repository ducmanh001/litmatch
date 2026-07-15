'use client';

import Link from 'next/link';

import { FriendAvatar } from '../../../features/friend-chat/components/friend-avatar';
import { useRoomList, useUserProfiles } from '../../../features/party-room/api';
import { decorativeListenerCount } from '../../../features/party-room/decorative-listener-count';

/** Demo fallback khi chưa có phòng thật đang mở — đúng phần "NỔI BẬT LÚC NÀY" của
 * layouts/web/party-list.html, không link phòng ảo (tránh 404). */
const FALLBACK_ROOMS = [
  { title: 'Tâm sự đêm khuya 🌙', host: 'Lan', listeners: 24 },
  { title: 'Hát cho nhau nghe 🎤', host: 'Khoa', listeners: 41 },
  { title: 'Làm quen Sài Gòn 👋', host: 'Vy', listeners: 18 },
];

/**
 * Cột phụ bên phải Bảng tin trên desktop (lg+) — đúng bố cục 2-3 cột của Twitter/Facebook/Zalo
 * web thay vì để 1 cột feed hẹp trôi giữa khoảng trắng mênh mông. Ghép dữ liệu Party Room thật
 * (feature khác) ở TẦNG ROUTE — feature không được import feature khác (docs/13 §13.3/12.9),
 * đây là lý do file này nằm cạnh page.tsx thay vì trong features/feed/.
 */
export function FeedSidebar() {
  const rooms = useRoomList();
  const items =
    rooms.data?.pages.flatMap((page) => page?.data ?? []).slice(0, 3) ?? [];
  const hostIds = [...new Set(items.map((room) => room.hostUserId))];
  const hostProfiles = useUserProfiles(hostIds);
  const hostNicknameById = new Map(
    hostIds.map((id, index) => [id, hostProfiles[index]?.data?.nickname]),
  );

  return (
    <aside className="sticky top-4 space-y-4">
      <div className="rounded-2xl border border-black/5 bg-white p-4 dark:border-white/5 dark:bg-surf">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-bold">Phòng đang hot 🔥</p>
          <Link href="/party" className="text-xs font-bold text-irisl">
            Xem tất cả
          </Link>
        </div>
        <ul className="space-y-3">
          {items.length > 0
            ? items.map((room) => (
                <li key={room.id}>
                  <Link
                    href={`/party/${room.id}`}
                    className="flex items-center gap-2.5"
                  >
                    <FriendAvatar
                      userId={room.hostUserId}
                      nickname={hostNicknameById.get(room.hostUserId) ?? ''}
                      size={40}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">
                        {room.title}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {hostNicknameById.get(room.hostUserId) ?? '…'} ·{' '}
                        {decorativeListenerCount(room.id)} nghe
                      </p>
                    </div>
                  </Link>
                </li>
              ))
            : FALLBACK_ROOMS.map((room) => (
                <li key={room.title} className="opacity-90">
                  <div className="flex items-center gap-2.5">
                    <FriendAvatar
                      userId={room.host}
                      nickname={room.host}
                      size={40}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">
                        {room.title}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {room.host} · {room.listeners} nghe
                      </p>
                    </div>
                  </div>
                </li>
              ))}
        </ul>
      </div>

      <div className="rounded-2xl bg-gradient-to-br from-irisl to-aqual p-4 text-white">
        <p className="font-bold">Khám phá bạn mới</p>
        <p className="mt-1 text-xs text-white/80">
          Duyệt hồ sơ quanh bạn, kết nối ngay hôm nay.
        </p>
        <Link
          href="/discovery"
          className="mt-3 inline-block rounded-full bg-white/20 px-3 py-1.5 text-xs font-bold backdrop-blur"
        >
          Khám phá ngay →
        </Link>
      </div>
    </aside>
  );
}
