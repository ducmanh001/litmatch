'use client';

import { isApiError } from '@litmatch/api-client';
import { useState } from 'react';

import { useIdempotencyKey } from '../../../shared/idempotency/use-idempotency-key';
import {
  useCreateSupportTicket,
  useMySupportTickets,
} from '../../../features/support/api';

import type {
  SupportTicketCategory,
  SupportTicketDto,
} from '../../../features/support/api';

const FAQ = [
  {
    question: 'Làm sao để mở khoá hồ sơ thật sau khi match?',
    answer:
      'Khi cả hai người cùng chọn "Thích" trong Soul Match hoặc Voice Match, hồ sơ thật của cả hai sẽ tự động mở khoá và chuyển thành bạn bè.',
  },
  {
    question: 'Diamond dùng để làm gì?',
    answer:
      'Diamond dùng để tặng quà trong Party Room, ưu tiên ghép nhanh ở Soul/Voice Match, và đổi một số đặc quyền khác. Nạp thêm ở mục Ví.',
  },
  {
    question: 'VIP có những đặc quyền gì?',
    answer:
      'VIP giúp ưu tiên ghép nhanh, xem được ai đã thích bạn, gọi Voice Match không giới hạn thời gian, và có huy hiệu riêng trên hồ sơ.',
  },
  {
    question: 'Làm sao báo cáo người dùng không phù hợp?',
    answer:
      'Vào Hồ sơ → Quyền riêng tư, chặn & báo cáo → Báo cáo một người dùng. Đội ngũ Litmatch sẽ xem xét trong thời gian sớm nhất.',
  },
  {
    question: 'Đổi được ảnh đại diện bao nhiêu lần?',
    answer:
      'Không giới hạn số lần. Vào Hồ sơ → Chỉnh sửa Avatar & hồ sơ để cập nhật bất cứ lúc nào.',
  },
] as const;

function FaqItem({
  question,
  answer,
  open,
  onToggle,
}: {
  question: string;
  answer: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
      >
        <span className="flex-1 text-sm font-semibold">{question}</span>
        <svg
          width={14}
          height={14}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}
          aria-hidden
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
      </button>
      <div
        className={`grid overflow-hidden transition-[grid-template-rows] duration-300 ease-out ${
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
      >
        <div className="overflow-hidden">
          <p className="px-4 pb-4 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
            {answer}
          </p>
        </div>
      </div>
    </div>
  );
}

/** Trang trợ giúp tĩnh — đúng layouts/web/help.html. */
export default function HelpPage() {
  const [feedback, setFeedback] = useState('');
  const [category, setCategory] = useState<SupportTicketCategory>('feedback');
  const [search, setSearch] = useState('');
  const [openQuestion, setOpenQuestion] = useState<string | null>(
    FAQ[0].question,
  );

  const createTicket = useCreateSupportTicket();
  const tickets = useMySupportTickets();
  const { key, resetKey } = useIdempotencyKey();

  const query = search.trim().toLowerCase();
  const filteredFaq = query
    ? FAQ.filter(
        (item) =>
          item.question.toLowerCase().includes(query) ||
          item.answer.toLowerCase().includes(query),
      )
    : FAQ;

  return (
    <main className="mx-auto min-h-screen w-full max-w-xl px-5 py-10">
      <h1 className="font-display mb-6 text-xl font-semibold italic">
        Trợ giúp &amp; phản hồi
      </h1>

      <div className="mb-6">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm câu hỏi thường gặp..."
          className="w-full rounded-full border border-black/5 bg-white px-4 py-3 text-sm outline-none focus:border-irisl dark:border-white/10 dark:bg-surf"
        />
      </div>

      <div className="mb-6">
        <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          Câu hỏi thường gặp
        </p>
        {filteredFaq.length > 0 ? (
          <div className="divide-y divide-black/5 overflow-hidden rounded-2xl border border-black/5 bg-white dark:divide-white/10 dark:border-white/10 dark:bg-surf">
            {filteredFaq.map((item) => (
              <FaqItem
                key={item.question}
                question={item.question}
                answer={item.answer}
                open={openQuestion === item.question}
                onToggle={() =>
                  setOpenQuestion((current) =>
                    current === item.question ? null : item.question,
                  )
                }
              />
            ))}
          </div>
        ) : (
          <p className="rounded-2xl border border-black/5 bg-white px-4 py-6 text-center text-sm text-slate-400 dark:border-white/10 dark:bg-surf dark:text-slate-500">
            Không tìm thấy câu hỏi phù hợp.
          </p>
        )}
      </div>

      <div>
        <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          Gửi phản hồi cho Litmatch
        </p>
        <div className="rounded-2xl border border-black/5 bg-white p-4 dark:border-white/10 dark:bg-surf">
          <textarea
            rows={4}
            value={feedback}
            onChange={(e) => {
              setFeedback(e.target.value);
            }}
            placeholder="Mô tả góp ý, lỗi gặp phải, hoặc ý tưởng bạn muốn Litmatch có..."
            className="w-full resize-none bg-transparent text-sm outline-none placeholder:text-slate-400"
          />
          <select
            aria-label="Loại phản hồi"
            value={category}
            onChange={(event) =>
              setCategory(event.target.value as SupportTicketCategory)
            }
            className="mt-3 h-10 w-full rounded-full bg-slate-100 px-4 text-sm dark:bg-surf2"
          >
            <option value="feedback">Góp ý chung</option>
            <option value="bug">Báo lỗi</option>
            <option value="idea">Đề xuất tính năng</option>
          </select>
          <button
            type="button"
            disabled={feedback.trim().length < 5 || createTicket.isPending}
            onClick={() => {
              createTicket.mutate(
                { category, message: feedback, idempotencyKey: key },
                {
                  onSuccess: () => {
                    setFeedback('');
                    resetKey();
                  },
                },
              );
            }}
            className="mt-3 w-full rounded-full bg-irisl py-3 font-bold text-white disabled:opacity-50"
          >
            {createTicket.isPending ? 'Đang gửi…' : 'Gửi phản hồi'}
          </button>
          {createTicket.isSuccess && (
            <p className="mt-2 text-sm font-semibold text-emerald-600">
              Đã ghi nhận phản hồi ✓
            </p>
          )}
          {createTicket.error !== null && (
            <p role="alert" className="mt-2 text-sm text-destructive">
              {isApiError(createTicket.error)
                ? createTicket.error.message
                : 'Không thể gửi phản hồi. Vui lòng đăng nhập và thử lại.'}
            </p>
          )}
        </div>
      </div>

      <div className="mt-6">
        <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-400">
          Phản hồi của bạn
        </p>
        {tickets.isPending && (
          <p className="text-sm text-slate-500">Đang tải…</p>
        )}
        {tickets.error !== null && (
          <p className="text-sm text-slate-500">
            Đăng nhập để theo dõi trạng thái phản hồi.
          </p>
        )}
        {tickets.data !== undefined && tickets.data.items.length === 0 && (
          <p className="text-sm text-slate-500">Bạn chưa gửi phản hồi nào.</p>
        )}
        <div className="space-y-2">
          {tickets.data?.items.map((ticket) => (
            <article
              key={ticket.id}
              className="rounded-2xl border border-black/5 bg-white p-4 dark:border-white/10 dark:bg-surf"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-bold">
                  {categoryLabel(ticket.category)}
                </span>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold dark:bg-surf2">
                  {statusLabel(ticket.status)}
                </span>
              </div>
              <p className="mt-2 line-clamp-3 text-sm">{ticket.message}</p>
              {ticket.staffResponse !== null && (
                <p className="mt-2 rounded-xl bg-emerald-500/10 p-3 text-sm">
                  <b>Litmatch:</b> {ticket.staffResponse}
                </p>
              )}
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}

function categoryLabel(category: SupportTicketDto['category']): string {
  return category === 'bug'
    ? 'Báo lỗi'
    : category === 'idea'
      ? 'Đề xuất'
      : 'Góp ý';
}

function statusLabel(status: SupportTicketDto['status']): string {
  const labels: Record<SupportTicketDto['status'], string> = {
    open: 'Đã tiếp nhận',
    in_progress: 'Đang xử lý',
    resolved: 'Đã giải quyết',
    closed: 'Đã đóng',
  };
  return labels[status];
}
