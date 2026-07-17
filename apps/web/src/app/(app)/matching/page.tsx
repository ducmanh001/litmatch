import Link from 'next/link';

import { IncomingInvites } from '../../../features/matching/components/incoming-invites';
import { QueueStatusPanel } from '../../../features/matching/components/queue-status-panel';
import { MatchIcon, MicIcon } from '../../../shared/ui/icons';
import { PageHeader } from '../../../shared/ui/page-header';

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
      <PageHeader
        eyebrow="Kết nối có chủ đích"
        eyebrowIcon={<MatchIcon width={16} height={16} />}
      />

      <div className="relative mb-5 overflow-hidden rounded-[1.75rem] border border-iris/15 bg-gradient-to-br from-iris/10 via-card to-card p-5 dark:border-white/10 dark:bg-none dark:bg-surf sm:p-7">
        <div
          className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-irisl/10 blur-3xl dark:bg-irisl/15"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-24 right-52 h-48 w-48 rounded-full bg-iris/10 blur-3xl dark:bg-iris/6"
          aria-hidden
        />
        <div className="relative flex flex-col gap-5 md:flex-row md:items-center md:justify-between md:gap-8">
          <div className="min-w-0 md:max-w-xl">
            <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.16em] text-irisl dark:text-white/85">
              Tìm người yêu · tìm người đồng hành
            </p>
            <h2 className="text-2xl font-extrabold leading-tight dark:text-white sm:text-3xl">
              Bắt đầu bằng một cuộc trò chuyện thật lòng.
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground dark:text-white/70">
              Litmatch giúp hai người làm quen qua câu chuyện và giọng nói,
              trong một không gian tôn trọng, rõ ràng và không vội vàng.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 md:shrink-0 md:flex-col md:items-stretch">
            <span className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-aqua to-irisl px-5 py-3 text-sm font-extrabold text-white shadow-md shadow-iris/20">
              <MatchIcon width={17} height={17} />
              Nhắn tin ẩn danh
            </span>
            <span className="inline-flex items-center justify-center gap-2 rounded-full border border-iris/20 bg-card/70 px-5 py-3 text-sm font-extrabold backdrop-blur dark:border-white/15 dark:bg-white/[0.05] dark:text-white">
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
