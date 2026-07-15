'use client';

import { useEffect, useState } from 'react';

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
  const [sent, setSent] = useState(false);
  const [search, setSearch] = useState('');
  const [openQuestion, setOpenQuestion] = useState<string | null>(
    FAQ[0].question,
  );

  useEffect(() => {
    if (!sent) return;
    const timeout = setTimeout(() => setSent(false), 2000);
    return () => clearTimeout(timeout);
  }, [sent]);

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
