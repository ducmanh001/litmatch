import Link from 'next/link';

import {
  DiscoveryIcon,
  MatchIcon,
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
    href: '/party',
    Icon: PartyIcon,
    label: 'Party Room',
    sub: 'Đang hot 🔥',
    gradient: 'from-irisl to-irisl',
  },
  {
    href: '/discovery',
    Icon: DiscoveryIcon,
    label: 'Khám phá',
    sub: 'Bạn mới quanh đây',
    gradient: 'from-aqual to-irisl',
  },
  {
    href: '/video',
    Icon: VideoIcon,
    label: 'Video',
    sub: 'Xem ngay',
    gradient: 'from-diamond to-aqual',
  },
  {
    href: '/palm-match',
    Icon: null,
    emoji: '🔮',
    label: 'Palm Match',
    sub: 'Bói vui',
    gradient: 'from-surf2 to-surf',
  },
  {
    href: '/matching',
    Icon: MatchIcon,
    label: 'Ghép đôi',
    sub: 'Tìm người nói chuyện',
    gradient: 'from-irisl to-aqual',
  },
];

/** Dải banner quảng bá tính năng kiểu "stories" (Facebook) — chèn dưới ô đăng bài. Tối thiểu 4
 * thẻ, cuộn ngang, mỗi thẻ trỏ tới 1 tính năng thật đã có trong app. */
export function FeedBanners() {
  return (
    <div className="no-scrollbar flex gap-3 overflow-x-auto pb-1">
      {BANNERS.map(({ href, Icon, emoji, label, sub, gradient }) => (
        <Link
          key={href}
          href={href}
          className={`flex h-40 w-28 shrink-0 flex-col justify-between rounded-2xl bg-gradient-to-br p-3 text-white shadow-lg shadow-iris/25 ${gradient}`}
        >
          {Icon !== null ? (
            <Icon width={22} height={22} />
          ) : (
            <span className="text-xl">{emoji}</span>
          )}
          <div>
            <p className="text-sm font-bold leading-tight">{label}</p>
            <p className="mt-0.5 text-[11px] text-white/80">{sub}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}
