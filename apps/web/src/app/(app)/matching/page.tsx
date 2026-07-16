import Link from 'next/link';

import { IncomingInvites } from '../../../features/matching/components/incoming-invites';
import { QueueStatusPanel } from '../../../features/matching/components/queue-status-panel';
import {
  ChevronLeftIcon,
  DiscoveryIcon,
  MatchIcon,
  MicIcon,
} from '../../../shared/ui/icons';

import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Ghép đôi' };

const MATCHING_STEPS = [
  {
    title: 'Chọn cách bắt đầu',
    description: 'Nhắn tin ẩn danh hoặc trò chuyện bằng giọng nói.',
  },
  {
    title: 'Hai người cùng xác nhận',
    description: 'Kết nối chỉ bắt đầu khi cả hai đều sẵn sàng.',
  },
  {
    title: 'Bạn quyết định bước tiếp',
    description: 'Tiếp tục khi thấy phù hợp, dừng lại bất cứ lúc nào.',
  },
] as const;

export default function MatchingPage() {
  return (
    <section className="mx-auto w-full max-w-[1040px] min-w-0 px-5 pb-8">
      <header className="flex items-center justify-between gap-4 pb-5">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/home"
            aria-label="Về trang chủ"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-iris/15 bg-card transition hover:border-iris/30 hover:bg-iris/10 dark:border-white/10 dark:bg-surf dark:text-white dark:hover:border-rose-300/30 dark:hover:bg-surf2"
          >
            <ChevronLeftIcon />
          </Link>
          <div className="min-w-0">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-rose-700 dark:text-rose-300">
              Kết nối có chủ đích
            </p>
            <h1 className="text-xl font-extrabold dark:text-white sm:text-2xl">
              Ghép đôi
            </h1>
          </div>
        </div>
        <Link
          href="/discovery"
          className="inline-flex shrink-0 items-center gap-2 rounded-full border border-transparent bg-gradient-to-r from-aqua to-irisl px-3 py-2 text-xs font-bold text-white shadow-sm shadow-iris/20 transition hover:brightness-105 sm:px-4 sm:text-sm"
        >
          <DiscoveryIcon width={17} height={17} />
          <span className="hidden sm:inline">Tìm quanh đây</span>
          <span className="sm:hidden">Quanh đây</span>
        </Link>
      </header>

      <div className="relative mb-5 overflow-hidden rounded-[1.75rem] border border-iris/15 bg-gradient-to-br from-iris/10 via-card to-card p-5 dark:border-white/10 dark:bg-none dark:bg-surf sm:p-7">
        <div
          className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-irisl/10 blur-3xl dark:bg-irisl/15"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-24 right-52 h-48 w-48 rounded-full bg-iris/10 blur-3xl dark:bg-iris/6"
          aria-hidden
        />
        <div className="relative max-w-2xl">
          <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.16em] text-rose-700 dark:text-white/85">
            Tìm người yêu · tìm người đồng hành
          </p>
          <h2 className="max-w-xl text-2xl font-extrabold leading-tight dark:text-white sm:text-3xl">
            Bắt đầu bằng một cuộc trò chuyện thật lòng.
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground dark:text-white/70">
            Litmatch giúp hai người làm quen qua câu chuyện và giọng nói, trong
            một không gian tôn trọng, rõ ràng và không vội vàng.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <span className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-aqua to-irisl px-5 py-3 text-sm font-extrabold text-white shadow-md shadow-iris/20">
              <MatchIcon width={17} height={17} />
              Nhắn tin ẩn danh
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-iris/20 bg-card/70 px-5 py-3 text-sm font-extrabold backdrop-blur dark:border-white/15 dark:bg-white/[0.05] dark:text-white">
              <MicIcon width={17} height={17} />
              Kết nối bằng voice
            </span>
          </div>
        </div>
      </div>

      <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start">
        <div className="order-1 min-w-0 rounded-[1.75rem] border border-border bg-card p-5 dark:border-white/10 dark:bg-surf sm:p-6">
          <QueueStatusPanel />
        </div>

        <aside className="order-2 min-w-0 space-y-4">
          <IncomingInvites />

          <section className="rounded-[1.75rem] border border-iris/15 bg-card p-5 dark:border-white/10 dark:bg-surf">
            <h2 className="text-sm font-extrabold dark:text-white">
              Một kết nối an toàn hơn
            </h2>
            <ol className="mt-4 space-y-4">
              {MATCHING_STEPS.map((step, index) => (
                <li key={step.title} className="flex gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-aqua to-irisl text-xs font-extrabold text-white">
                    {index + 1}
                  </span>
                  <div>
                    <p className="text-sm font-bold leading-5 dark:text-white">
                      {step.title}
                    </p>
                    <p className="mt-0.5 text-xs leading-5 text-muted-foreground dark:text-white/70">
                      {step.description}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <Link
            href="/discovery"
            className="group block rounded-[1.75rem] border border-iris/20 bg-iris/[0.06] p-5 text-foreground transition hover:border-iris/35 hover:bg-iris/10 dark:border-white/10 dark:bg-surf dark:text-white dark:hover:border-irisl/30 dark:hover:bg-white/[0.04]"
          >
            <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-irisl dark:text-white/70">
              Muốn chủ động hơn?
            </p>
            <p className="mt-2 text-base font-extrabold">
              Xem người phù hợp quanh đây
            </p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground dark:text-white/70">
              Khám phá hồ sơ rồi gửi lời mời Soul hoặc Voice khi bạn thấy đồng
              điệu.
            </p>
            <span className="mt-4 inline-flex items-center gap-2 rounded-full bg-irisl px-3 py-2 text-xs font-extrabold text-white">
              Mở Quanh đây
              <span
                aria-hidden
                className="transition group-hover:translate-x-1"
              >
                →
              </span>
            </span>
          </Link>
        </aside>
      </div>
    </section>
  );
}
