'use client';

import { isApiError } from '@litmatch/api-client';
import { useState } from 'react';

import { useReading } from '../api';

import type { PalmMatchCategory } from '../api';

const CATEGORIES: { value: PalmMatchCategory; label: string; emoji: string }[] =
  [
    { value: 'love', label: 'Tình yêu', emoji: '💕' },
    { value: 'career', label: 'Sự nghiệp', emoji: '💼' },
    { value: 'health', label: 'Sức khoẻ', emoji: '🌿' },
    { value: 'general', label: 'Tổng quát', emoji: '✨' },
  ];

/** Đúng bản chất thật của Palm Match (docs/services/palm-match-service.md): 1 bài đọc solo
 * deterministic theo category + ngày server, KHÔNG ghép cặp ai, KHÔNG có % hợp duyên — mockup
 * layouts/web/palm-match.html hình dung ghép cặp ẩn danh là UI giả không có backend, đã bỏ
 * (docs/07-roadmap.md § Frontend track). */
export function PalmReadingView() {
  const [category, setCategory] = useState<PalmMatchCategory | null>(null);
  const [targetName, setTargetName] = useState('');
  const reading = useReading(category, targetName);

  if (category === null) {
    return (
      <div className="px-5">
        <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
          Chọn 1 chủ đề để xem bài đọc hôm nay — đổi ngày sẽ ra bài đọc khác,
          cùng ngày hỏi lại luôn ra cùng 1 kết quả.
        </p>
        <label
          htmlFor="targetName"
          className="mb-2 block text-xs font-bold uppercase text-slate-500 dark:text-slate-400"
        >
          Tên người bạn muốn nhắc tới (không bắt buộc)
        </label>
        <input
          id="targetName"
          value={targetName}
          onChange={(e) => setTargetName(e.target.value)}
          placeholder="Ví dụ: Lan"
          className="mb-5 h-12 w-full rounded-xl bg-slate-100 px-4 text-sm outline-none focus:ring-2 focus:ring-iris dark:bg-surf2"
        />
        <div className="grid grid-cols-2 gap-3">
          {CATEGORIES.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setCategory(option.value)}
              className="flex flex-col items-center gap-2 rounded-2xl border border-black/5 bg-white py-6 transition hover:-translate-y-0.5 dark:border-white/5 dark:bg-surf"
            >
              <span className="text-2xl">{option.emoji}</span>
              <span className="text-sm font-bold">{option.label}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="px-5">
      {reading.isPending && (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Đang xem bài…
        </p>
      )}
      {reading.isError && (
        <p role="alert" className="text-sm text-destructive">
          {isApiError(reading.error)
            ? reading.error.message
            : 'Có lỗi xảy ra, thử lại.'}
        </p>
      )}
      {reading.data !== undefined && (
        <div className="mb-6 rounded-3xl bg-gradient-to-br from-irisl to-aqual p-6 text-white">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide opacity-80">
            {CATEGORIES.find((c) => c.value === reading.data?.category)?.label}
          </p>
          <p className="font-display text-sm opacity-90">
            {new Date(reading.data.forDate).toLocaleDateString('vi-VN')}
          </p>
        </div>
      )}
      {reading.data !== undefined && (
        <div className="mb-8 rounded-2xl border border-black/5 bg-white p-5 dark:border-white/5 dark:bg-surf">
          <p className="text-sm leading-relaxed">{reading.data.content}</p>
        </div>
      )}
      <button
        type="button"
        onClick={() => setCategory(null)}
        className="w-full rounded-full bg-gradient-to-br from-irisl to-aqual py-3 font-bold text-white shadow-lg shadow-iris/30"
      >
        Xem chủ đề khác
      </button>
    </div>
  );
}
