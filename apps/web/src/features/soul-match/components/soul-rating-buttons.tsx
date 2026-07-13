'use client';

import { isApiError } from '@litmatch/api-client';

import { useRateSession } from '../api';

import type { SoulVerdict } from '../api';

const VERDICT_LABEL: Record<SoulVerdict, string> = {
  like: 'Thích',
  boring: 'Nhạt nhẽo',
  rude: 'Thô lỗ',
};

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
    <div className="space-y-1.5">
      <p className="text-sm font-medium">Đánh giá đối phương</p>
      <div className="flex gap-2">
        {(Object.keys(VERDICT_LABEL) as SoulVerdict[]).map((verdict) => (
          <button
            key={verdict}
            type="button"
            className={
              myVerdict === verdict
                ? 'h-9 flex-1 rounded-md bg-primary text-sm font-medium text-primary-foreground'
                : 'h-9 flex-1 rounded-md border border-border text-sm hover:bg-card disabled:opacity-50'
            }
            disabled={rate.isPending}
            onClick={() => rate.mutate(verdict)}
          >
            {VERDICT_LABEL[verdict]}
          </button>
        ))}
      </div>
      {myVerdict !== null && (
        <p className="text-sm text-muted-foreground">
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
