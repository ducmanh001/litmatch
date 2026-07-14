'use client';

import { useState } from 'react';

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
    question: 'Làm sao báo cáo người dùng không phù hợp?',
    answer:
      'Vào Hồ sơ → Quyền riêng tư, chặn & báo cáo → Báo cáo một người dùng. Đội ngũ Litmatch sẽ xem xét trong thời gian sớm nhất.',
  },
] as const;

function FaqItem({
  question,
  answer,
  defaultOpen,
}: {
  question: string;
  answer: string;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
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
      {open && (
        <p className="px-4 pb-4 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
          {answer}
        </p>
      )}
    </div>
  );
}

/** Trang trợ giúp tĩnh — đúng layouts/web/help.html. */
export default function HelpPage() {
  const [feedback, setFeedback] = useState('');
  const [sent, setSent] = useState(false);

  return (
    <main className="mx-auto min-h-screen w-full max-w-xl px-5 py-10">
      <h1 className="font-display mb-6 text-xl font-semibold italic">
        Trợ giúp &amp; phản hồi
      </h1>

      <div className="mb-6">
        <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          Câu hỏi thường gặp
        </p>
        <div className="divide-y divide-black/5 overflow-hidden rounded-2xl border border-black/5 bg-white dark:divide-white/10 dark:border-white/10 dark:bg-surf">
          {FAQ.map((item, index) => (
            <FaqItem key={item.question} {...item} defaultOpen={index === 0} />
          ))}
        </div>
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
              setSent(false);
            }}
            placeholder="Mô tả góp ý, lỗi gặp phải, hoặc ý tưởng bạn muốn Litmatch có..."
            className="w-full resize-none bg-transparent text-sm outline-none placeholder:text-slate-400"
          />
          <button
            type="button"
            disabled={feedback.trim() === ''}
            onClick={() => {
              setSent(true);
              setFeedback('');
            }}
            className="mt-3 w-full rounded-full bg-irisl py-3 font-bold text-white disabled:opacity-50"
          >
            {sent ? 'Đã gửi, cảm ơn bạn ✓' : 'Gửi phản hồi'}
          </button>
        </div>
      </div>
    </main>
  );
}
