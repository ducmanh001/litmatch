'use client';

import { isApiError } from '@litmatch/api-client';

import { cn } from '../../../shared/lib/cn';
import { useRateSession } from '../api';

import type { SoulVerdict } from '../api';

const VERDICT_LABEL: Record<SoulVerdict, string> = {
  like: 'Thích',
  boring: 'Nhàm chán',
  rude: 'Thô lỗ',
};

// Emoji chỉ để trang trí (khớp visual grammar mockup) — không phải dữ liệu nghiệp vụ.
const VERDICT_EMOJI: Record<SoulVerdict, string> = {
  rude: '😠',
  boring: '😐',
  like: '💜',
};

// Thứ tự hiển thị theo mockup: tiêu cực → trung lập → tích cực (ô "Thích" nổi bật cuối).
const VERDICT_ORDER: SoulVerdict[] = ['rude', 'boring', 'like'];

export function SoulRatingButtons({
  sessionId,
  myVerdict,
}: {
  sessionId: string;
  myVerdict: SoulVerdict | null;
}) {
  const rate = useRateSession(sessionId);

  const message = isApiError(rate.error)
    ? rate.error.message
    : rate.error != null
      ? 'Có lỗi xảy ra, thử lại.'
      : undefined;

  return (
    <div className="space-y-3 px-5 py-4">
      <div>
        <p className="text-sm font-bold">Bạn thấy người này thế nào?</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Nếu cả hai cùng chọn &quot;Thích&quot;, hồ sơ thật sẽ được mở khoá.
        </p>
      </div>
      <div className="grid w-full grid-cols-3 gap-3">
        {VERDICT_ORDER.map((verdict) => (
          <button
            key={verdict}
            type="button"
            disabled={rate.isPending}
            onClick={() => rate.mutate(verdict)}
            className={cn(
              'flex flex-col items-center gap-2 rounded-2xl py-4 transition hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-50',
              verdict === 'like'
                ? 'bg-gradient-to-br from-irisl to-irisl text-white'
                : 'border border-black/5 bg-white dark:border-white/5 dark:bg-surf',
              myVerdict === verdict &&
                verdict !== 'like' &&
                'border-iris/40 bg-iris/10',
            )}
          >
            <span className="text-2xl" aria-hidden>
              {VERDICT_EMOJI[verdict]}
            </span>
            <span className="text-xs font-bold">{VERDICT_LABEL[verdict]}</span>
          </button>
        ))}
      </div>
      {myVerdict !== null && (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Bạn đã đánh giá: {VERDICT_LABEL[myVerdict]} — chờ đối phương.
        </p>
      )}
      {message !== undefined && (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      )}
    </div>
  );
}
