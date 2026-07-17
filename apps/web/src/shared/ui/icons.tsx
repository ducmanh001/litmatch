import type { SVGProps } from 'react';

/** Icon set dùng chung cho nav (sidebar + bottom nav) — 1 chỗ khai duy nhất, không rải SVG. */
type IconProps = SVGProps<SVGSVGElement>;

const base = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export function LogoMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width={22} height={22} viewBox="0 0 28 28" aria-hidden {...props}>
      <circle cx={11} cy={14} r={8} fill="currentColor" opacity={0.9} />
      <circle
        cx={18}
        cy={14}
        r={8}
        className="text-accent"
        fill="currentColor"
        opacity={0.75}
      />
    </svg>
  );
}

export function HomeIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5.5 10v9a1 1 0 0 0 1 1H9a1 1 0 0 0 1-1v-4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4a1 1 0 0 0 1 1h2.5a1 1 0 0 0 1-1v-9" />
    </svg>
  );
}

export function FeedIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x={3.5} y={4.3} width={6} height={6} rx={1.4} />
      <rect x={3.5} y={13.7} width={6} height={6} rx={1.4} />
      <path d="M12.7 6.3h7.8M12.7 9.7h7.8M12.7 15.7h7.8M12.7 19.1h7.8" />
    </svg>
  );
}

export function MatchIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 5.8A2.8 2.8 0 0 1 6.8 3h10.4A2.8 2.8 0 0 1 20 5.8v7.4a2.8 2.8 0 0 1-2.8 2.8H10l-4.6 3.6v-3.6H6.8A2.8 2.8 0 0 1 4 13.2V5.8Z" />
    </svg>
  );
}

export function FriendsIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x={3} y={5.5} width={18} height={13} rx={2.4} />
      <path d="m4 7.2 8 5.8 8-5.8" />
    </svg>
  );
}

export function PartyIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx={9} cy={8} r={3} />
      <path d="M3.4 20c0-3.3 2.5-5.4 5.6-5.4S14.6 16.7 14.6 20" />
      <circle cx={17.2} cy={9} r={2.3} />
      <path d="M15.9 14.3c2.3.35 4 2.2 4 5.2" />
    </svg>
  );
}

export function MicIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
      <path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" />
    </svg>
  );
}

export function WalletIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x={2} y={6} width={20} height={13} rx={2} />
      <path d="M2 10h20" />
      <circle cx={16} cy={14.5} r={1.5} fill="currentColor" stroke="none" />
    </svg>
  );
}

export function ProfileIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx={12} cy={8.2} r={3.6} />
      <path d="M4.5 20c0-4 3.4-6.6 7.5-6.6s7.5 2.6 7.5 6.6" />
    </svg>
  );
}

export function DiamondIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={13}
      height={13}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      {...props}
    >
      <path d="M6 3h12l3 5-9 13L3 8z" />
    </svg>
  );
}

export function LogoutIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

export function DiscoveryIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z" />
      <circle cx={12} cy={9.5} r={2.4} />
    </svg>
  );
}

/** Icon "tìm kiếm" thuần (kính lúp) — dùng khi nội dung thực sự là hành động tìm/lọc, khác
 * DiscoveryIcon (ghim vị trí, dùng cho khái niệm Quanh đây/Khám phá). */
export function SearchIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx={10.6} cy={10.6} r={6.4} />
      <path d="m20 20-4.7-4.7" />
    </svg>
  );
}

export function VideoIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x={3} y={6} width={13} height={12} rx={2.6} />
      <path d="m21 8.5-5 3 5 3v-6Z" />
    </svg>
  );
}

/** Nút "quay lại" ở top bar full-screen (soul-match.html) — dùng chung cho matching + soul-chat. */
export function BellIcon(props: IconProps) {
  return (
    <svg {...base} aria-hidden {...props}>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

export function ChevronLeftIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      aria-hidden
      {...props}
    >
      <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ChevronDownIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={12}
      height={12}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      aria-hidden
      {...props}
    >
      <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Toggle sáng/tối nhị phân ở header (docs/13 § 13.9). */
export function MoonIcon(props: IconProps) {
  return (
    <svg {...base} aria-hidden {...props}>
      <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z" />
    </svg>
  );
}

export function SunIcon(props: IconProps) {
  return (
    <svg {...base} aria-hidden {...props}>
      <circle cx={12} cy={12} r={4.2} />
      <path d="M12 2.5v2.4M12 19.1v2.4M4.6 4.6l1.7 1.7M17.7 17.7l1.7 1.7M2.5 12h2.4M19.1 12h2.4M4.6 19.4l1.7-1.7M17.7 6.3l1.7-1.7" />
    </svg>
  );
}

export function MoreIcon(props: IconProps) {
  return (
    <svg {...base} aria-hidden {...props}>
      <rect x={4} y={4} width={7} height={7} rx={2} />
      <rect x={13} y={4} width={7} height={7} rx={2} />
      <rect x={4} y={13} width={7} height={7} rx={2} />
      <rect x={13} y={13} width={7} height={7} rx={2} />
    </svg>
  );
}

/** Nút chọn ngôn ngữ ở header — hiện tại chỉ UI placeholder (chưa có i18n thật). */
export function GlobeIcon(props: IconProps) {
  return (
    <svg {...base} aria-hidden {...props}>
      <circle cx={12} cy={12} r={8.5} />
      <path d="M3.5 12h17M12 3.5c2.4 2.3 3.6 5.3 3.6 8.5s-1.2 6.2-3.6 8.5c-2.4-2.3-3.6-5.3-3.6-8.5S9.6 5.8 12 3.5Z" />
    </svg>
  );
}
