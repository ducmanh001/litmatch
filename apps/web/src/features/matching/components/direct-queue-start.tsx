'use client';

import { isApiError } from '@litmatch/api-client';
import { useCallback, useEffect, useRef } from 'react';

import { useIdempotencyKey } from '../../../shared/idempotency/use-idempotency-key';
import { Button } from '../../../shared/ui/button';
import { useJoinQueue } from '../api';
import { MatchingScanner } from './matching-scanner';

import type { TicketDto } from '../api';

/** CTA trang Matching đi thẳng vào hàng đợi. `matchType` là ý định người dùng vừa bấm;
 * server vẫn là nơi chọn người, kiểm tra điều kiện và tạo session. */
export function DirectQueueStart({
  matchType,
  onJoined,
}: {
  matchType: TicketDto['matchType'];
  onJoined: (ticket: TicketDto) => void;
}) {
  const joinQueue = useJoinQueue();
  const { key, resetKey } = useIdempotencyKey();
  const started = useRef(false);
  const label = matchType === 'soul' ? 'trò chuyện ẩn danh' : 'Voice Match';

  const start = useCallback(() => {
    if (started.current) return;
    started.current = true;
    joinQueue.mutate(
      {
        body: { matchType, genderPreference: 'any' },
        idempotencyKey: key,
      },
      {
        onSuccess: (ticket) => {
          if (ticket === undefined) return;
          resetKey();
          onJoined(ticket);
        },
      },
    );
  }, [joinQueue, key, matchType, onJoined, resetKey]);

  useEffect(() => start(), [start]);

  const error = isApiError(joinQueue.error)
    ? joinQueue.error.message
    : joinQueue.error !== null && joinQueue.error !== undefined
      ? 'Không thể bắt đầu tìm kiếm, vui lòng thử lại.'
      : undefined;

  return (
    <div className="flex min-h-[380px] flex-col items-center justify-center px-3 py-8 text-center sm:px-8">
      <MatchingScanner matchType={matchType} />
      <p className="mt-6 text-[11px] font-extrabold uppercase tracking-[0.14em] text-muted-foreground dark:text-white/85">
        Đang khởi động {label}
      </p>
      <h2 className="mt-2 text-2xl font-extrabold dark:text-white">
        Đang quét kết nối phù hợp…
      </h2>
      {error === undefined ? (
        <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground dark:text-white/70">
          Litmatch đang đưa bạn vào hàng ghép đôi và sẽ mở phòng ngay khi có
          người phù hợp.
        </p>
      ) : (
        <>
          <p
            role="alert"
            className="mt-3 max-w-md text-sm leading-6 text-destructive"
          >
            {error}
          </p>
          <Button
            type="button"
            className="mt-5 bg-irisl text-white shadow-none hover:bg-irisl/90"
            disabled={joinQueue.isPending}
            onClick={() => {
              started.current = false;
              start();
            }}
          >
            Thử lại
          </Button>
        </>
      )}
    </div>
  );
}
