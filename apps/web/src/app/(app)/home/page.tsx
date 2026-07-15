'use client';

import Link from 'next/link';

import { useCurrentUser } from '../../../shared/auth/use-current-user';
import { DiamondIcon, MatchIcon, MicIcon } from '../../../shared/ui/icons';
import { PlaceholderAvatar } from '../../../shared/ui/placeholder-avatar';
import { useRoomList } from '../../../features/party-room/api';
import { decorativeListenerCount } from '../../../features/party-room/decorative-listener-count';
import { useWallet } from '../../../features/wallet/api';

import type { SVGProps } from 'react';

function MovieIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={24}
      height={24}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <rect x={2} y={5} width={20} height={14} rx={2} />
      <path d="M2 9h20M7 5v4M17 5v4" />
    </svg>
  );
}

function PalmIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={24}
      height={24}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M12 2l2.5 6H21l-5 4.5L18 20l-6-4-6 4 2-7.5L3 8h6.5z" />
    </svg>
  );
}

function BellIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 01-3.46 0" />
    </svg>
  );
}

const MODES = [
  {
    title: 'Soul Match',
    description: 'Chat ẩn danh 2-3 phút',
    Icon: MatchIcon,
    href: '/matching',
    cardClassName:
      'bg-gradient-to-br from-irisl to-irisl text-white shadow-lg shadow-iris/25',
    iconClassName: '',
  },
  {
    title: 'Voice Match',
    description: 'Nghe giọng ~7 phút',
    Icon: MicIcon,
    href: '/matching',
    cardClassName:
      'border border-black/5 bg-white dark:border-white/5 dark:bg-surf',
    iconClassName: 'text-irisl',
  },
  {
    title: 'Movie Match',
    description: 'Xem chung, chat cùng lúc',
    Icon: MovieIcon,
    href: '/movie-match',
    cardClassName:
      'border border-black/5 bg-white dark:border-white/5 dark:bg-surf',
    iconClassName: 'text-aqua dark:text-aqual',
  },
  {
    title: 'Palm Match',
    description: 'Bói vui tình yêu',
    Icon: PalmIcon,
    href: '/palm-match',
    cardClassName:
      'bg-gradient-to-br from-aqual to-irisl text-white shadow-lg shadow-iris/25',
    iconClassName: '',
  },
] as const;

/** Demo fallback khi chưa có phòng thật đang mở (dev chưa seed / đã bị sweeper đóng) — đúng
 * layouts/web/home.html, không link phòng ảo (tránh 404, tránh đánh lừa "đang live"). */
const FALLBACK_TRENDING_ROOMS = [
  { title: 'Tâm sự đêm khuya 🌙', listeners: 24 },
  { title: 'Hát cho nhau nghe 🎤', listeners: 41 },
  { title: 'Làm quen Sài Gòn', listeners: 18 },
];

function RoomAvatarStack({ roomId }: { roomId: string }) {
  return (
    <div className="mb-3 flex -space-x-2">
      {[roomId, `${roomId}-2`, `${roomId}-3`].map((seed) => (
        <PlaceholderAvatar
          key={seed}
          seed={seed}
          size={32}
          className="border-2 border-white dark:border-surf"
        />
      ))}
    </div>
  );
}

function TrendingRooms() {
  const { data, isPending, isError } = useRoomList();
  const rooms =
    data?.pages.flatMap((page) => page?.data ?? []).slice(0, 6) ?? [];

  if (isPending) {
    return (
      <p className="px-5 text-sm text-slate-500 dark:text-slate-400">
        Đang tải phòng…
      </p>
    );
  }
  if (isError) {
    return (
      <p role="alert" className="px-5 text-sm text-destructive">
        Không tải được danh sách phòng.
      </p>
    );
  }
  if (rooms.length === 0) {
    return (
      <div className="no-scrollbar flex gap-3 overflow-x-auto px-5 pb-2">
        {FALLBACK_TRENDING_ROOMS.map((room) => (
          <div
            key={room.title}
            className="w-40 shrink-0 rounded-2xl border border-black/5 bg-white p-3 opacity-90 dark:border-white/5 dark:bg-surf"
          >
            <RoomAvatarStack roomId={room.title} />
            <p className="text-sm font-bold leading-tight">{room.title}</p>
            <p className="mt-1 flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              {room.listeners} đang nghe
            </p>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="no-scrollbar flex gap-3 overflow-x-auto px-5 pb-2">
      {rooms.map((room) => (
        <Link
          key={room.id}
          href={`/party/${room.id}`}
          className="w-40 shrink-0 rounded-2xl border border-black/5 bg-white p-3 dark:border-white/5 dark:bg-surf"
        >
          <RoomAvatarStack roomId={room.id} />
          <p className="text-sm font-bold leading-tight">{room.title}</p>
          <p className="mt-1 flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            {decorativeListenerCount(room.id)} đang nghe
          </p>
        </Link>
      ))}
    </div>
  );
}

/** Trang chủ — đúng layouts/web/home.html: top bar + chế độ ghép đôi + phòng đang hoạt động. */
export default function HomePage() {
  const { data: user } = useCurrentUser();
  const { data: wallet } = useWallet();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between px-5">
        <div className="flex items-center gap-3">
          <PlaceholderAvatar
            seed={user?.id ?? 'me'}
            size={44}
            className="border-2 border-iris/30"
          />
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Chào buổi tối 👋
            </p>
            <p className="text-sm font-bold">{user?.nickname ?? '…'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/wallet"
            className="flex items-center gap-1 rounded-full bg-diamond/15 px-3 py-2 text-xs font-extrabold text-sky-600 dark:text-diamond"
          >
            <DiamondIcon /> {wallet?.balance ?? 0}
          </Link>
          <button
            type="button"
            aria-label="Thông báo"
            className="relative flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 dark:bg-surf2"
          >
            <BellIcon />
            <span className="absolute right-2 top-1.5 h-1.5 w-1.5 rounded-full bg-rose-500" />
          </button>
        </div>
      </div>

      <div className="mb-6 px-5">
        <h2 className="mb-3 text-sm font-extrabold tracking-wide text-slate-500 dark:text-slate-400">
          GHÉP ĐÔI NGAY
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {MODES.map(
            ({
              title,
              description,
              Icon,
              href,
              cardClassName,
              iconClassName,
            }) => {
              const isGradient = cardClassName.includes('gradient');
              return (
                <Link
                  key={title}
                  href={href}
                  className={`rounded-2xl p-4 ${cardClassName}`}
                >
                  <Icon
                    width={24}
                    height={24}
                    className={`mb-6 ${iconClassName}`}
                  />
                  <p className="font-bold">{title}</p>
                  <p
                    className={`mt-0.5 text-xs ${isGradient ? 'text-white/80' : 'text-slate-500 dark:text-slate-400'}`}
                  >
                    {description}
                  </p>
                </Link>
              );
            },
          )}
        </div>
      </div>

      <div className="mb-4">
        <div className="mb-3 flex items-center justify-between px-5">
          <h2 className="text-sm font-extrabold tracking-wide text-slate-500 dark:text-slate-400">
            PHÒNG ĐANG HOT 🔥
          </h2>
          <Link href="/party" className="text-xs font-bold text-irisl">
            Xem tất cả →
          </Link>
        </div>
        <TrendingRooms />
      </div>
    </div>
  );
}
