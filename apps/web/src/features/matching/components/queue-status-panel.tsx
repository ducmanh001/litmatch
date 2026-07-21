'use client';

import { isApiError } from '@litmatch/api-client';
import { RealtimeEvents } from '@litmatch/common-dtos/pure';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useRealtimeEvent } from '../../../shared/realtime/use-realtime-event';
import { Button } from '../../../shared/ui/button';
import { MatchIcon, MicIcon } from '../../../shared/ui/icons';
import {
  matchingKeys,
  useCancelTicket,
  useConfirmTicket,
  useCurrentTicket,
  useTicket,
} from '../api';
import { MatchTypePicker } from './match-type-picker';
import { DirectQueueStart } from './direct-queue-start';
import { MatchingScanner } from './matching-scanner';
import { SpeedupButton } from './speedup-button';

import type { MatchConfirmedEventData } from '@litmatch/common-dtos/pure';
import type { TicketDto } from '../api';

const OUTLINE_PILL =
  'border-border bg-card hover:bg-muted dark:border-white/15 dark:bg-white/[0.05] dark:text-white dark:hover:bg-white/10';
const CENTERED_STATE =
  'flex min-h-[380px] flex-col items-center justify-center px-3 py-8 text-center sm:px-8';

function RetryIcon() {
  return (
    <svg
      width={19}
      height={19}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 12a9 9 0 0 1 15.3-6.4M21 12a9 9 0 0 1-15.3 6.4" />
      <path d="M18 3v4h-4M6 21v-4h4" />
    </svg>
  );
}

const SESSION_ICON =
  'flex h-[50px] w-[50px] shrink-0 items-center justify-center rounded-full bg-iris/10 text-irisl dark:bg-rose-300/15 dark:text-white';

/** Không hiện thẳng message kỹ thuật (vd "Validation failed (uuid is expected)") cho người dùng
 * khi không khôi phục được phiên — log để debug, còn UI chỉ nói người dùng cần biết gì. */
function logAndGetFriendlyMessage(error: unknown, fallback: string): string {
  if (error !== null && error !== undefined) {
    console.error('[matching] không khôi phục được phiên ghép đôi:', error);
  }
  return fallback;
}

function mutationErrorMessage(error: unknown): string | undefined {
  if (isApiError(error)) return error.message;
  if (error !== null && error !== undefined) {
    return 'Không thể hoàn tất thao tác, vui lòng thử lại.';
  }
  return undefined;
}

export function QueueStatusPanel() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [directStartConsumed, setDirectStartConsumed] = useState(false);
  const legacyConfirmStarted = useRef<string | null>(null);
  const matchParam = searchParams.get('match');
  const directMatchType =
    matchParam === 'soul' || matchParam === 'voice' ? matchParam : null;
  const startRequested = searchParams.get('start') === '1';
  const activeDirectMatch = useRef<TicketDto['matchType'] | null>(
    startRequested ? directMatchType : null,
  );
  const previousMatchParam = useRef(directMatchType);

  const currentTicketQuery = useCurrentTicket();
  const activeTicketId =
    ticketId ?? currentTicketQuery.data?.ticket?.id ?? null;
  const ticketQuery = useTicket(activeTicketId);
  const cancelTicket = useCancelTicket(activeTicketId ?? '');
  const confirmTicket = useConfirmTicket(activeTicketId ?? '');

  const invalidateTicket = useCallback(() => {
    if (activeTicketId === null) return;
    void queryClient.invalidateQueries({
      queryKey: matchingKeys.ticket(activeTicketId),
    });
  }, [activeTicketId, queryClient]);

  // Realtime chỉ là gợi ý để refetch sớm — REST poll của useTicket vẫn là fallback thật.
  useRealtimeEvent<MatchConfirmedEventData>(
    RealtimeEvents.MatchConfirmed,
    (data) => {
      if (data.ticketId === activeTicketId) {
        invalidateTicket();
        return;
      }
      // Invite có thể được accept trong lúc user đang mở Matching. Realtime chỉ làm UI bắt kịp;
      // GET ticket vẫn là nguồn sự thật khi event bị lỡ.
      if (activeTicketId === null) setTicketId(data.ticketId);
    },
  );

  const ticket = ticketQuery.data;
  const cancelError = mutationErrorMessage(cancelTicket.error);
  const confirmError = mutationErrorMessage(confirmTicket.error);

  useEffect(() => {
    if (previousMatchParam.current === directMatchType) return;
    previousMatchParam.current = directMatchType;
    setDirectStartConsumed(false);
  }, [directMatchType]);

  useEffect(() => {
    if (ticket?.status !== 'confirmed' || ticket.sessionId === null) return;
    const dest =
      ticket.matchType === 'soul'
        ? `/matching/soul/${ticket.sessionId}`
        : `/matching/voice/${ticket.sessionId}`;
    router.replace(dest);
  }, [ticket, router]);

  // Tương thích session pending_confirm tồn tại trước khi đổi flow: client tự hoàn tất, tuyệt đối
  // không render lại nút "Xác nhận". Session mới luôn đã confirmed tại transaction ghép cặp.
  useEffect(() => {
    if (
      ticket?.status !== 'matched' ||
      legacyConfirmStarted.current === ticket.id
    )
      return;
    legacyConfirmStarted.current = ticket.id;
    confirmTicket.mutate();
  }, [confirmTicket, ticket]);

  // Đổi loại từ CTA mobile hoặc đóng bước xác nhận phải rời queue thật trước khi UI được phép
  // bắt đầu intent mới. Backend vẫn là chốt transition queued→cancelled.
  useEffect(() => {
    if (ticket?.status !== 'queued' || cancelTicket.isPending) return;
    const startedType = activeDirectMatch.current;
    const changedDirectType =
      directMatchType !== null && directMatchType !== ticket.matchType;
    const cancelledDirectIntent =
      startedType !== null &&
      (directMatchType !== startedType || !startRequested);
    if (!changedDirectType && !cancelledDirectIntent) return;

    cancelTicket.mutate(undefined, {
      onSuccess: () => {
        activeDirectMatch.current = null;
        setTicketId(null);
      },
    });
  }, [
    cancelTicket,
    directMatchType,
    startRequested,
    ticket?.matchType,
    ticket?.status,
  ]);

  if (ticketId === null && currentTicketQuery.isPending) {
    return (
      <div className={CENTERED_STATE} role="status">
        <span className="h-10 w-10 animate-spin rounded-full border-2 border-iris/20 border-t-irisl" />
        <p className="mt-4 text-sm font-semibold text-muted-foreground dark:text-white/70">
          Đang kiểm tra phiên ghép đôi của bạn…
        </p>
      </div>
    );
  }

  if (ticketId === null && currentTicketQuery.isError) {
    const message = logAndGetFriendlyMessage(
      currentTicketQuery.error,
      'Đã có lỗi khi tải dữ liệu phiên của bạn. Thử lại, hoặc bắt đầu một phiên ghép đôi mới.',
    );
    return (
      <div className={`${CENTERED_STATE} gap-5`}>
        <div className={SESSION_ICON}>
          <RetryIcon />
        </div>
        <div>
          <p className="font-extrabold dark:text-white">
            Không tải được phiên ghép đôi trước đó
          </p>
          <p
            role="alert"
            className="mt-2 text-sm text-muted-foreground dark:text-white/70"
          >
            {message}
          </p>
        </div>
        <Button
          type="button"
          className="w-full max-w-xs bg-gradient-to-r from-aqua to-irisl text-white shadow-md shadow-iris/15 hover:brightness-95"
          disabled={currentTicketQuery.isFetching}
          onClick={() => void currentTicketQuery.refetch()}
        >
          <RetryIcon />
          {currentTicketQuery.isFetching ? 'Đang thử lại…' : 'Thử lại'}
        </Button>
      </div>
    );
  }

  if (activeTicketId === null) {
    if (directMatchType !== null && startRequested && !directStartConsumed) {
      return (
        <DirectQueueStart
          matchType={directMatchType}
          onJoined={(joined) => {
            activeDirectMatch.current = joined.matchType;
            setDirectStartConsumed(true);
            setTicketId(joined.id);
          }}
        />
      );
    }
    return <MatchTypePicker onJoined={(joined) => setTicketId(joined.id)} />;
  }

  if (ticketQuery.isPending) {
    return (
      <div className={CENTERED_STATE} role="status">
        <span className="h-10 w-10 animate-spin rounded-full border-2 border-iris/20 border-t-irisl" />
        <p className="mt-4 text-sm font-semibold text-muted-foreground dark:text-white/70">
          Đang tải trạng thái ghép đôi…
        </p>
      </div>
    );
  }

  if (ticketQuery.isError) {
    const message = logAndGetFriendlyMessage(
      ticketQuery.error,
      'Đã có lỗi khi tải dữ liệu phiên của bạn. Thử lại, hoặc bắt đầu một phiên ghép đôi mới.',
    );
    return (
      <div className={`${CENTERED_STATE} gap-5`}>
        <div className={SESSION_ICON}>
          <RetryIcon />
        </div>
        <div>
          <p className="font-extrabold dark:text-white">
            Không tải được phiên ghép đôi trước đó
          </p>
          <p
            role="alert"
            className="mt-2 text-sm text-muted-foreground dark:text-white/70"
          >
            {message}
          </p>
        </div>
        <Button
          type="button"
          className="w-full max-w-xs bg-gradient-to-r from-aqua to-irisl text-white shadow-md shadow-iris/15 hover:brightness-95"
          onClick={() => setTicketId(null)}
        >
          <RetryIcon />
          Chọn lại kiểu ghép đôi
        </Button>
      </div>
    );
  }

  if (ticket === undefined) return null;

  const matchLabel =
    ticket.matchType === 'soul' ? 'Ghép đôi Tâm hồn' : 'Ghép đôi Voice';
  const StateIcon = ticket.matchType === 'soul' ? MatchIcon : MicIcon;

  switch (ticket.status) {
    case 'queued':
      return (
        <div className={`${CENTERED_STATE} gap-6`} aria-live="polite">
          <MatchingScanner matchType={ticket.matchType} />

          <div className="max-w-md">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-muted-foreground dark:text-white/85">
              {matchLabel}
            </p>
            <h2 className="mt-2 text-2xl font-extrabold dark:text-white">
              Đang tìm người ghép đôi…
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground dark:text-white/70">
              Litmatch đang quét các kết nối phù hợp và chọn cặp tốt nhất cho
              bạn. Ghép được là vào phòng ngay.
            </p>
            <p className="mt-3 text-[11px] font-semibold text-muted-foreground dark:text-white/60">
              Vào hàng đợi lúc{' '}
              {new Date(ticket.enqueuedAt).toLocaleTimeString('vi-VN', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          </div>

          <div className="flex flex-wrap items-start justify-center gap-2">
            <SpeedupButton
              ticketId={ticket.id}
              priceDiamond={ticket.speedupPriceDiamond}
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className={OUTLINE_PILL}
              disabled={cancelTicket.isPending}
              onClick={() =>
                cancelTicket.mutate(undefined, {
                  onSuccess: () => {
                    activeDirectMatch.current = null;
                    setTicketId(null);
                    router.replace('/matching');
                  },
                })
              }
            >
              {cancelTicket.isPending ? 'Đang huỷ…' : 'Huỷ tìm kiếm'}
            </Button>
          </div>
          {cancelError !== undefined && (
            <p
              role="alert"
              className="max-w-sm rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive"
            >
              {cancelError}
            </p>
          )}
        </div>
      );
    case 'matched':
      return (
        <div
          className={`${CENTERED_STATE} gap-5`}
          aria-live="polite"
          role="status"
        >
          <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-iris/10 text-irisl dark:bg-white/[0.05] dark:text-white">
            <StateIcon width={34} height={34} />
            <span className="absolute -right-1 -top-1 flex h-8 w-8 items-center justify-center rounded-full border-4 border-card bg-emerald-500 text-sm font-black text-white">
              ✓
            </span>
          </div>
          <div className="max-w-md">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-muted-foreground dark:text-white/85">
              {matchLabel}
            </p>
            <h2 className="mt-2 text-2xl font-extrabold dark:text-white">
              Đã tìm thấy một người phù hợp
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground dark:text-white/70">
              Đang mở phòng trò chuyện cho hai bạn…
            </p>
          </div>
          <span className="h-9 w-9 animate-spin rounded-full border-2 border-iris/20 border-t-irisl" />
          {confirmError !== undefined && (
            <p
              role="alert"
              className="max-w-sm rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive"
            >
              {confirmError}
            </p>
          )}
        </div>
      );
    case 'confirmed':
      return (
        <div className={CENTERED_STATE} role="status">
          <span className="h-10 w-10 animate-spin rounded-full border-2 border-iris/20 border-t-irisl" />
          <p className="mt-4 text-sm font-semibold text-muted-foreground dark:text-white/70">
            Đã xác nhận — đang chuyển vào phòng…
          </p>
        </div>
      );
    case 'expired':
    case 'cancelled':
      return (
        <div className={`${CENTERED_STATE} gap-5`}>
          <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-muted text-xl text-muted-foreground dark:bg-white/10 dark:text-white/70">
            {ticket.status === 'expired' ? '⌛' : '✓'}
          </div>
          <div>
            <h2 className="text-xl font-extrabold dark:text-white">
              {ticket.status === 'expired'
                ? 'Phiên tìm kiếm đã hết hạn'
                : 'Đã huỷ tìm kiếm'}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground dark:text-white/70">
              {ticket.status === 'expired'
                ? 'Bạn có thể bắt đầu một lượt ghép đôi mới.'
                : 'Không có kết nối nào được tạo từ lượt tìm kiếm này.'}
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            className={`w-full max-w-xs ${OUTLINE_PILL}`}
            onClick={() => setTicketId(null)}
          >
            Tìm lại
          </Button>
        </div>
      );
  }
}
