'use client';

import Link from 'next/link';

import { useCurrentUser } from '../../../shared/auth/use-current-user';
import {
  DiamondIcon,
  DiscoveryIcon,
  MatchIcon,
  MicIcon,
  PartyIcon,
  ProfileIcon,
} from '../../../shared/ui/icons';
import { useRoomList } from '../../../features/party-room/api';
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

const MODES = [
  {
    title: 'Soul Match',
    description: 'Chat ẩn danh 2-3 phút',
    Icon: MatchIcon,
    href: '/matching',
    highlight: true,
  },
  {
    title: 'Voice Match',
    description: 'Nghe giọng ~7 phút',
    Icon: MicIcon,
    href: '/matching',
    highlight: false,
  },
  {
    title: 'Movie Match',
    description: 'Xem chung với bạn bè',
    Icon: MovieIcon,
    href: '/movie-match',
    highlight: false,
  },
  {
    title: 'Palm Match',
    description: 'Bói vui theo chủ đề',
    Icon: PalmIcon,
    href: '/palm-match',
    highlight: false,
  },
] as const;

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
      <p className="px-5 text-sm text-slate-500 dark:text-slate-400">
        Chưa có phòng nào đang hoạt động.
      </p>
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
          <p className="text-sm font-bold leading-tight">{room.title}</p>
          <p className="mt-1 flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Tối đa {room.speakerLimit} người nói
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
          <span className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-iris/30 bg-slate-100 dark:bg-surf2">
            <ProfileIcon width={22} height={22} className="text-slate-400" />
          </span>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Chào buổi tối 👋
            </p>
            <p className="text-sm font-bold">{user?.nickname ?? '…'}</p>
          </div>
        </div>
        <Link
          href="/wallet"
          className="flex items-center gap-1 rounded-full bg-diamond/15 px-3 py-2 text-xs font-extrabold text-sky-600 dark:text-diamond"
        >
          <DiamondIcon /> {wallet?.balance ?? 0}
        </Link>
      </div>

      <div className="mb-6 px-5">
        <h2 className="mb-3 text-sm font-extrabold tracking-wide text-slate-500 dark:text-slate-400">
          GHÉP ĐÔI NGAY
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {MODES.map(({ title, description, Icon, href, highlight }) => (
            <Link
              key={title}
              href={href}
              className={
                highlight
                  ? 'rounded-2xl bg-gradient-to-br from-irisl to-irisl p-4 text-white shadow-lg shadow-iris/25'
                  : 'rounded-2xl border border-black/5 bg-white p-4 dark:border-white/5 dark:bg-surf'
              }
            >
              <Icon
                width={24}
                height={24}
                className={`mb-6 ${highlight ? '' : 'text-irisl'}`}
              />
              <p className="font-bold">{title}</p>
              <p
                className={`mt-0.5 text-xs ${highlight ? 'text-white/80' : 'text-slate-500 dark:text-slate-400'}`}
              >
                {description}
              </p>
            </Link>
          ))}
        </div>
      </div>

      <div className="mb-4">
        <div className="mb-3 flex items-center justify-between px-5">
          <h2 className="text-sm font-extrabold tracking-wide text-slate-500 dark:text-slate-400">
            PHÒNG ĐANG HOẠT ĐỘNG 🔥
          </h2>
          <Link href="/party" className="text-xs font-bold text-irisl">
            Xem tất cả →
          </Link>
        </div>
        <TrendingRooms />
      </div>

      <div className="mx-5 mb-3 space-y-3">
        <Link
          href="/discovery"
          className="flex items-center gap-4 rounded-2xl border border-black/5 bg-white p-4 dark:border-white/5 dark:bg-surf"
        >
          <DiscoveryIcon
            width={24}
            height={24}
            className="shrink-0 text-irisl"
          />
          <div>
            <p className="text-sm font-bold">Khám phá</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Duyệt hồ sơ quanh bạn theo tuổi, giới tính hoặc vị trí gần.
            </p>
          </div>
        </Link>

        <Link
          href="/party"
          className="flex items-center gap-4 rounded-2xl border border-black/5 bg-white p-4 dark:border-white/5 dark:bg-surf"
        >
          <PartyIcon width={24} height={24} className="shrink-0 text-irisl" />
          <div>
            <p className="text-sm font-bold">Tạo phòng của riêng bạn</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Mời bạn bè và người lạ cùng trò chuyện trong phòng voice.
            </p>
          </div>
        </Link>
      </div>
    </div>
  );
}
