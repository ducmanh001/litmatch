import type { SVGProps } from 'react';

/** Icon set dùng chung cho nav (sidebar + bottom nav) — 1 chỗ khai duy nhất, không rải SVG. */
type IconProps = SVGProps<SVGSVGElement>;

const base = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
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
      <path d="M12 3l9 8h-3v9h-5v-6H11v6H6v-9H3z" />
    </svg>
  );
}

export function FeedIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x={3} y={3} width={18} height={18} rx={4} />
      <path d="M8 13l3 3 5-6" />
    </svg>
  );
}

export function MatchIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
    </svg>
  );
}

export function FriendsIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx={9} cy={8} r={4} />
      <path d="M2 21c0-4 3.5-6 7-6s7 2 7 6" />
      <path d="M15 9h5M17.5 6.5v5" />
    </svg>
  );
}

export function PartyIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx={9} cy={7} r={3} />
      <circle cx={17} cy={8} r={2.5} />
      <path d="M2 21v-1a6 6 0 016-6h1a6 6 0 016 6v1M16 14a5 5 0 015 5v2" />
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
      <circle cx={12} cy={8} r={4} />
      <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
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
      <circle cx={11} cy={11} r={7} />
      <path d="M21 21l-4.35-4.35" />
    </svg>
  );
}
