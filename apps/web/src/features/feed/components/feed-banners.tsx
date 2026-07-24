'use client';

import Link from 'next/link';
import { useRef } from 'react';

import {
  DiscoveryIcon,
  FriendsIcon,
  MatchIcon,
  MicIcon,
  PartyIcon,
  VideoIcon,
} from '../../../shared/ui/icons';

import type { ComponentType, SVGProps } from 'react';

const BANNERS: ReadonlyArray<{
  href: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>> | null;
  emoji?: string;
  label: string;
  sub: string;
  gradient: string;
}> = [
  {
    href: '/discovery',
    Icon: DiscoveryIcon,
    label: 'Quanh đây',
    sub: 'Tìm người cùng mục tiêu',
    gradient: 'from-aqual to-irisl',
  },
  {
    href: '/matching',
    Icon: MicIcon,
    label: 'Voice Match',
    sub: 'Trò chuyện bằng giọng nói',
    gradient: 'from-irisl to-aqual',
  },
  {
    href: '/matching',
    Icon: MatchIcon,
    label: 'Soul Match',
    sub: 'Bắt đầu bằng câu chuyện',
    gradient: 'from-irisl to-irisl',
  },
  {
    href: '/party',
    Icon: PartyIcon,
    label: 'Party Room',
    sub: 'Trò chuyện theo nhóm',
    gradient: 'from-aqual to-diamond',
  },
  {
    href: '/video',
    Icon: VideoIcon,
    label: 'Video',
    sub: 'Xem khoảnh khắc thật',
    gradient: 'from-diamond to-irisl',
  },
  {
    href: '/friends',
    Icon: FriendsIcon,
    label: 'Tin nhắn',
    sub: 'Trò chuyện cùng bạn bè',
    gradient: 'from-irisl to-surf2',
  },
];

function ChevronIcon({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={direction === 'left' ? 'm15 18-6-6 6-6' : 'm9 18 6-6-6-6'} />
    </svg>
  );
}

/** Shortcut tính năng dạng stories: chỉ lộ một viewport, phần còn lại đi qua snap carousel. */
export function FeedBanners() {
  const railRef = useRef<HTMLUListElement>(null);

  const moveCarousel = (direction: -1 | 1) => {
    const rail = railRef.current;
    if (rail === null) return;
    rail.scrollBy({
      left: direction * Math.max(rail.clientWidth * 0.75, 240),
      behavior: 'smooth',
    });
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-black/5 bg-white px-3 py-3 dark:border-white/5 dark:bg-surf">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold">Bắt đầu kết nối</h2>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Quanh đây, tin nhắn hoặc giọng nói
          </p>
        </div>
        <div
          role="group"
          className="flex items-center gap-1"
          aria-label="Điều khiển khám phá"
        >
          <button
            type="button"
            aria-label="Xem mục trước"
            aria-controls="feed-feature-carousel"
            onClick={() => moveCarousel(-1)}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-black/5 text-slate-500 transition hover:bg-black/5 hover:text-irisl dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
          >
            <ChevronIcon direction="left" />
          </button>
          <button
            type="button"
            aria-label="Xem mục tiếp theo"
            aria-controls="feed-feature-carousel"
            onClick={() => moveCarousel(1)}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-black/5 text-slate-500 transition hover:bg-black/5 hover:text-irisl dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
          >
            <ChevronIcon direction="right" />
          </button>
        </div>
      </div>

      <ul
        id="feed-feature-carousel"
        ref={railRef}
        aria-label="Lối tắt tính năng"
        className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth pb-1"
      >
        {BANNERS.map(({ href, Icon, emoji, label, sub, gradient }) => (
          <li
            key={`${href}-${label}`}
            className="w-[108px] shrink-0 snap-start"
          >
            <Link
              href={href}
              className="group flex flex-col items-center text-center"
            >
              <span
                className={`flex h-14 w-14 items-center justify-center rounded-full border-white/70 bg-gradient-to-br text-white shadow-md shadow-iris/20 transition group-hover:-translate-y-0.5 group-focus-visible:-translate-y-0.5 ${gradient}`}
              >
                {Icon !== null ? (
                  <Icon width={22} height={22} />
                ) : (
                  <span className="text-xl" aria-hidden>
                    {emoji}
                  </span>
                )}
              </span>
              <span className="mt-1.5 w-full truncate text-xs font-bold">
                {label}
              </span>
              <span className="w-full truncate text-[10px] text-slate-500 dark:text-slate-400">
                {sub}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
