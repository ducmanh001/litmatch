'use client';

import Link from 'next/link';

import { useCurrentUser } from '../../../shared/auth/use-current-user';
import {
  DiamondIcon,
  DiscoveryIcon,
  FeedIcon,
  FriendsIcon,
  MatchIcon,
  MicIcon,
  PartyIcon,
  VideoIcon,
} from '../../../shared/ui/icons';
import { LanguageSelector } from '../../../shared/ui/language-selector';
import { PlaceholderAvatar } from '../../../shared/ui/placeholder-avatar';
import { ThemeToggleButton } from '../../../shared/ui/theme-toggle-button';
import { NotificationBell } from '../../../features/notification/components/notification-bell';
import { useRoomList } from '../../../features/party-room/api';
import { useWallet } from '../../../features/wallet/api';

import type { ComponentType, ReactNode, SVGProps } from 'react';

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

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
      aria-hidden
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
      aria-hidden
      {...props}
    >
      <path d="M12 2l2.5 6H21l-5 4.5L18 20l-6-4-6 4 2-7.5L3 8h6.5z" />
    </svg>
  );
}

function ArrowUpRightIcon(props: SVGProps<SVGSVGElement>) {
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
      {...props}
    >
      <path d="M7 17 17 7M8 7h9v9" />
    </svg>
  );
}

const MODES = [
  {
    title: 'Soul Match',
    description: 'Trò chuyện trước, hiểu nhau sau',
    Icon: MatchIcon,
    href: '/matching',
    cardClassName:
      'border border-black/5 bg-white dark:border-white/10 dark:bg-surf dark:text-white',
    iconClassName: 'bg-iris/10 text-irisl',
    descriptionClassName: 'text-muted-foreground dark:text-white/65',
  },
  {
    title: 'Voice Match',
    description: 'Nghe giọng thật, nói chuyện chân thành',
    Icon: MicIcon,
    href: '/matching',
    cardClassName:
      'border border-black/5 bg-white dark:border-white/10 dark:bg-surf dark:text-white',
    iconClassName: 'bg-iris/10 text-irisl',
    descriptionClassName: 'text-muted-foreground dark:text-white/70',
  },
  {
    title: 'Movie Match',
    description: 'Xem chung, chat cùng lúc',
    Icon: MovieIcon,
    href: '/movie-match',
    cardClassName:
      'border border-black/5 bg-white dark:border-white/10 dark:bg-surf dark:text-white',
    iconClassName: 'bg-iris/10 text-irisl',
    descriptionClassName: 'text-muted-foreground dark:text-white/70',
  },
  {
    title: 'Palm Match',
    description: 'Một chút bói vui tình yêu',
    Icon: PalmIcon,
    href: '/palm-match',
    cardClassName:
      'border border-black/5 bg-white dark:border-white/10 dark:bg-surf dark:text-white',
    iconClassName: 'bg-iris/10 text-irisl',
    descriptionClassName: 'text-muted-foreground dark:text-white/65',
  },
] as const;

const QUICK_LINKS = [
  {
    title: 'Party',
    description: 'Vào phòng trò chuyện',
    href: '/party',
    Icon: PartyIcon,
    iconClassName: 'bg-iris/10 text-irisl',
  },
  {
    title: 'Bảng tin',
    description: 'Xem câu chuyện mới',
    href: '/feed',
    Icon: FeedIcon,
    iconClassName: 'bg-iris/10 text-irisl',
  },
  {
    title: 'Tin nhắn',
    description: 'Trò chuyện cùng bạn bè',
    href: '/friends',
    Icon: FriendsIcon,
    iconClassName: 'bg-iris/10 text-irisl',
  },
  {
    title: 'Video',
    description: 'Lướt khoảnh khắc ngắn',
    href: '/video',
    Icon: VideoIcon,
    iconClassName: 'bg-iris/10 text-irisl',
  },
] satisfies ReadonlyArray<{
  title: string;
  description: string;
  href: string;
  Icon: IconComponent;
  iconClassName: string;
}>;

function RoomAvatarStack({ roomId }: { roomId: string }) {
  return (
    <PlaceholderAvatar
      seed={roomId}
      size={32}
      className="border-2 border-card"
    />
  );
}

function RoomCardContent({
  roomId,
  title,
  listeners,
}: {
  roomId: string;
  title: string;
  listeners: number;
}) {
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <RoomAvatarStack roomId={roomId} />
        <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/40" />
      </div>
      <div className="mt-5">
        <p className="line-clamp-2 text-sm font-bold leading-snug">{title}</p>
        <p className="mt-1 text-xs text-muted-foreground dark:text-white/60">
          {listeners} người trong phòng
        </p>
      </div>
    </>
  );
}

function RoomCards({ children }: { children: ReactNode }) {
  return (
    <div className="no-scrollbar flex snap-x gap-3 overflow-x-auto px-5 pb-5 sm:grid sm:grid-cols-2 sm:overflow-visible lg:grid-cols-2 xl:grid-cols-3">
      {children}
    </div>
  );
}

function TrendingRooms() {
  const { data, isPending, isError, refetch } = useRoomList();
  const rooms =
    data?.pages.flatMap((page) => page?.data ?? []).slice(0, 6) ?? [];

  if (isPending) {
    return (
      <RoomCards>
        {[0, 1, 2].map((item) => (
          <div
            key={item}
            className="h-36 w-52 shrink-0 animate-pulse snap-start rounded-2xl bg-muted sm:w-auto"
          />
        ))}
      </RoomCards>
    );
  }

  if (isError) {
    return (
      <div className="mx-5 mb-5 rounded-2xl bg-muted p-4" role="alert">
        <p className="text-sm font-semibold">Không tải được danh sách phòng.</p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="mt-2 text-xs font-bold text-rose-700 dark:text-white"
        >
          Thử lại
        </button>
      </div>
    );
  }

  if (rooms.length === 0) {
    return (
      <div className="mx-5 mb-5 rounded-2xl border border-dashed border-black/10 p-5 text-sm text-muted-foreground dark:border-white/10">
        Chưa có Party Room nào đang hoạt động.
      </div>
    );
  }

  return (
    <RoomCards>
      {rooms.map((room) => (
        <Link
          key={room.id}
          href={`/party/${room.id}`}
          className="w-52 shrink-0 snap-start rounded-2xl border border-black/5 bg-slate-50/80 p-4 transition hover:-translate-y-0.5 hover:border-iris/30 sm:w-auto dark:border-white/10 dark:bg-white/5"
        >
          <RoomCardContent
            roomId={room.id}
            title={room.title}
            listeners={room.memberCount ?? 0}
          />
        </Link>
      ))}
    </RoomCards>
  );
}

function SectionHeading({
  eyebrow,
  title,
  action,
}: {
  eyebrow: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-rose-700 dark:text-irisl">
          {eyebrow}
        </p>
        <h2 className="font-display mt-1 text-xl font-semibold sm:text-2xl">
          {title}
        </h2>
      </div>
      {action}
    </div>
  );
}

/** Dashboard sau đăng nhập: mọi block dùng chung rail với header, còn sidebar do app layout sở hữu. */
export default function HomePage() {
  const { data: user } = useCurrentUser();
  const { data: wallet } = useWallet();

  return (
    <div className="mx-auto w-full px-5 pb-4 dark:text-white">
      <header className="mb-5 flex items-center justify-between gap-3">
        <Link
          href="/profile"
          className="flex min-w-0 items-center gap-3 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <PlaceholderAvatar
            seed={user?.id ?? 'me'}
            size={46}
            className="shrink-0 border-2 border-iris/30"
          />
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground dark:text-white/65">
              Rất vui gặp lại 👋
            </p>
            <p className="truncate text-sm font-bold">
              {user?.nickname ?? '…'}
            </p>
          </div>
        </Link>

        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/wallet"
            className="flex shrink-0 items-center gap-2 rounded-full border border-diamond/20 bg-diamond/15 px-3 py-2 text-xs font-extrabold text-diamond-foreground transition hover:bg-diamond/20 dark:text-white"
            aria-label={`Mở ví, số dư ${wallet?.balance ?? 0} diamond`}
          >
            <DiamondIcon />
            <span>{wallet?.balance ?? 0}</span>
            <span className="hidden font-semibold opacity-70 sm:inline">
              diamond
            </span>
          </Link>
          <ThemeToggleButton />
          <LanguageSelector />
          <NotificationBell />
        </div>
      </header>

      <section className="glow relative isolate overflow-hidden rounded-[2rem] border border-iris/15 bg-card px-6 py-8 shadow-xl shadow-iris/10 sm:px-9 sm:py-10 lg:px-12 xl:grid xl:min-h-[430px] xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-center xl:gap-10 dark:border-white/10 dark:bg-ink dark:shadow-black/20">
        <div className="pointer-events-none absolute -right-20 top-10 h-72 w-72 rounded-full border-[42px] border-white/25 dark:border-white/10" />

        <div className="relative z-10 max-w-2xl">
          {/* <span className="inline-flex rounded-full border border-iris/20 bg-white/65 px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.18em] text-rose-700 backdrop-blur dark:border-rose-300/25 dark:bg-rose-300/10 dark:text-rose-300">
            Hẹn hò nghiêm túc · đồng hành lâu dài
          </span> */}
          <h1 className="font-display mt-5 max-w-2xl text-3xl font-semibold leading-[1.12] text-slate-950 sm:text-4xl lg:text-5xl dark:text-white">
            Trò chuyện chân thành,
            <span className="block bg-gradient-to-r from-aqual via-irisl to-iris bg-clip-text text-transparent">
              tìm thấy người đồng hành.
            </span>
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-slate-600 sm:text-base dark:text-white/80">
            Gặp người ở gần hoặc bắt đầu bằng Voice Match. Cùng tìm hiểu nghiêm
            túc, tôn trọng ranh giới và hướng tới một mối quan hệ lâu dài.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              href="/discovery"
              className="inline-flex items-center gap-2 rounded-full bg-irisl px-5 py-3 text-sm font-bold text-white shadow-lg shadow-iris/30 transition hover:-translate-y-0.5 hover:brightness-105"
            >
              Tìm người quanh đây
              <ArrowUpRightIcon />
            </Link>
            <Link
              href="/matching"
              className="inline-flex items-center gap-2 rounded-full border border-iris/20 bg-white/70 px-5 py-3 text-sm font-bold text-slate-800 backdrop-blur transition hover:border-iris/40 hover:bg-white dark:border-white/20 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
            >
              Bắt đầu Voice Match
            </Link>
          </div>
          <p className="mt-5 text-xs font-medium text-slate-500 dark:text-white/65">
            Chủ động kết nối · tôn trọng riêng tư · ưu tiên an toàn
          </p>
        </div>

        <div className="relative z-10 mt-9 flex min-h-[330px] items-center justify-center xl:mt-0 xl:min-h-0">
          <span className="pulsering motion-reduce:[animation:none!important] absolute h-40 w-40 rounded-full border border-iris/35 dark:border-white/20" />
          <span className="pulsering2 motion-reduce:[animation:none!important] absolute h-40 w-40 rounded-full border border-iris/35 dark:border-white/15" />
          <div className="floatslow motion-reduce:[animation:none!important] relative z-10 w-[17.5rem] overflow-hidden rounded-[1.75rem] border border-white/60 bg-white/90 shadow-2xl shadow-iris/20 backdrop-blur dark:border-white/15 dark:bg-surf/95 dark:shadow-black/35">
            <div className="relative flex h-48 items-center justify-center bg-gradient-to-br from-irisl to-aqual">
              <span className="font-display text-7xl text-white/90">M</span>
              <span className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-iris shadow-sm">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-3.5 w-3.5"
                  aria-hidden
                >
                  <path d="m5 13 4 4L19 7" />
                </svg>
              </span>
              <span className="absolute left-4 top-4 rounded-full border border-white/25 bg-black/20 px-2.5 py-1 text-[10px] font-bold text-white backdrop-blur">
                Hồ sơ minh hoạ
              </span>
              <span className="absolute bottom-4 left-4 flex items-center gap-1.5 rounded-full bg-black/35 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur">
                <MicIcon width={13} height={13} />
                Ưu tiên kết nối bằng voice
              </span>
            </div>
            <div className="p-5">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Minh Anh, 27
              </h2>
              <p className="font-mono mt-1 text-[11px] text-slate-500 dark:text-white/60">
                Đà Nẵng · tìm mối quan hệ lâu dài
              </p>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-white/80">
                Thích những cuộc trò chuyện tử tế và những chuyến đi chậm.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {['Du lịch', 'Cà phê', 'Đọc sách'].map((tag) => (
                  <span
                    key={tag}
                    className="font-mono rounded-full bg-iris/10 px-2.5 py-1 text-[10px] text-rose-700 dark:bg-white/10 dark:text-white/85"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-5 rounded-[1.75rem] border border-black/5 bg-white p-5 dark:border-white/10 dark:bg-surf sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-rose-700 dark:text-irisl">
              Truy cập nhanh
            </p>
            <h2 className="mt-1 text-base font-bold sm:text-lg">
              Tiếp tục khám phá Litmatch
            </h2>
          </div>
          <span className="rounded-full bg-iris/10 px-2.5 py-1 text-[10px] font-bold text-rose-700 dark:bg-white/10 dark:text-white/75">
            4 lựa chọn
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {QUICK_LINKS.map(
            ({ title, description, href, Icon, iconClassName }) => (
              <Link
                key={href}
                href={href}
                className="group rounded-2xl border border-black/5 bg-slate-50/80 p-3.5 transition hover:-translate-y-0.5 hover:border-iris/20 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-white/5 dark:bg-white/5 dark:hover:border-iris/25 dark:hover:bg-white/10"
              >
                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-xl ${iconClassName}`}
                >
                  <Icon width={18} height={18} />
                </span>
                <span className="mt-3 block text-sm font-bold">{title}</span>
                <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground dark:text-white/65">
                  {description}
                </span>
              </Link>
            ),
          )}
        </div>
      </section>

      <section className="mt-7">
        <SectionHeading
          eyebrow="Bắt đầu một cuộc gặp"
          title="Chọn nhịp kết nối phù hợp"
          action={
            <Link
              href="/matching"
              className="hidden items-center gap-1 rounded-full bg-irisl px-3 py-2 text-xs font-bold text-white transition hover:bg-iris/90 sm:flex"
            >
              Xem ghép đôi
              <ArrowUpRightIcon width={14} height={14} />
            </Link>
          }
        />

        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {MODES.map(
            ({
              title,
              description,
              Icon,
              href,
              cardClassName,
              iconClassName,
              descriptionClassName,
            }) => (
              <Link
                key={title}
                href={href}
                className={`group flex min-h-44 flex-col rounded-2xl p-4 transition hover:-translate-y-0.5 sm:p-5 ${cardClassName}`}
              >
                <span
                  className={`flex h-11 w-11 items-center justify-center rounded-xl ${iconClassName}`}
                >
                  <Icon width={22} height={22} />
                </span>
                <span className="mt-auto flex items-end justify-between gap-2 pt-7">
                  <span>
                    <span className="block text-sm font-bold sm:text-base">
                      {title}
                    </span>
                    <span
                      className={`mt-1 block text-[11px] leading-snug sm:text-xs ${descriptionClassName}`}
                    >
                      {description}
                    </span>
                  </span>
                  <ArrowUpRightIcon className="mb-0.5 hidden shrink-0 opacity-70 sm:block" />
                </span>
              </Link>
            ),
          )}
        </div>
      </section>

      <div className="mt-7 grid gap-5 lg:grid-cols-12">
        <section className="min-w-0 overflow-hidden rounded-[1.75rem] border border-black/5 bg-white lg:col-span-8 dark:border-white/10 dark:bg-surf">
          <div className="p-5 pb-4">
            <SectionHeading
              eyebrow="Đang diễn ra"
              title="Phòng được quan tâm"
              action={
                <Link
                  href="/party"
                  className="flex shrink-0 items-center gap-1 rounded-full bg-irisl px-3 py-2 text-xs font-bold text-white transition hover:bg-iris/90"
                >
                  Xem tất cả
                  <ArrowUpRightIcon width={14} height={14} />
                </Link>
              }
            />
          </div>
          <TrendingRooms />
        </section>

        <Link
          href="/discovery"
          className="group relative flex min-h-60 overflow-hidden rounded-[1.75rem] border border-black/5 bg-white p-6 lg:col-span-4 dark:border-white/10 dark:bg-surf"
        >
          <div className="relative flex w-full flex-col">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-iris/10 text-irisl">
              <DiscoveryIcon width={20} height={20} />
            </span>
            <p className="mt-5 text-[11px] font-extrabold uppercase tracking-[0.18em] text-rose-700 dark:text-irisl">
              Khám phá
            </p>
            <h2 className="font-display mt-1 max-w-xs text-2xl font-semibold leading-tight">
              Tìm người ở gần, cùng mong muốn gắn bó.
            </h2>
            <div className="mt-auto flex items-end justify-between gap-4 pt-5">
              <p className="max-w-xs text-xs leading-relaxed text-muted-foreground sm:text-sm dark:text-white/70">
                Tìm hiểu hồ sơ theo nhịp riêng, rồi chủ động kết nối khi cả hai
                có chung điều đang tìm kiếm.
              </p>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-irisl text-white transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:bg-iris/90">
                <ArrowUpRightIcon />
              </span>
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}
