'use client';

import { isApiError } from '@litmatch/api-client';
import { RealtimeEvents } from '@litmatch/common-dtos/pure';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { useRealtimeEvent } from '../../../shared/realtime/use-realtime-event';
import { Button } from '../../../shared/ui/button';
import {
  matchingKeys,
  useCancelTicket,
  useConfirmTicket,
  useTicket,
} from '../api';
import { MatchTypePicker } from './match-type-picker';
import { SpeedupButton } from './speedup-button';

import type {
  MatchConfirmedEventData,
  MatchMatchedEventData,
} from '@litmatch/common-dtos/pure';

/** Pill "Huỷ tìm kiếm" của soul-match.html — viền, không nền, chỉ tô mờ khi hover. */
const OUTLINE_PILL =
  'border-black/10 bg-transparent hover:bg-black/5 dark:border-white/10 dark:bg-transparent dark:hover:bg-white/5';
/** Card trắng/surf viền mảnh dùng chung cho mọi trạng thái hàng đợi (không có mockup riêng). */
const STATE_CARD =
  'rounded-2xl border border-black/5 bg-white dark:border-white/5 dark:bg-surf';

export function QueueStatusPanel() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [ticketId, setTicketId] = useState<string | null>(null);

  const ticketQuery = useTicket(ticketId);
  const cancelTicket = useCancelTicket(ticketId ?? '');
  const confirmTicket = useConfirmTicket(ticketId ?? '');

  const invalidateTicket = useCallback(() => {
    if (ticketId === null) return;
    void queryClient.invalidateQueries({
      queryKey: matchingKeys.ticket(ticketId),
    });
  }, [queryClient, ticketId]);

  // Realtime chỉ là gợi ý để refetch sớm — REST poll của useTicket vẫn là fallback thật.
  useRealtimeEvent<MatchMatchedEventData>(
    RealtimeEvents.MatchMatched,
    (data) => {
      if (data.ticketId === ticketId) {
        invalidateTicket();
        return;
      }
      // Ticket lạ trong khi CHƯA có ticket nào — đây là lời mời (Discovery/Invite) mình gửi vừa
      // được chấp nhận: backend cố ý publish CÙNG event `match.matched` cho cả 2 bên
      // (invite.service.ts#acceptInvite) để FE không cần logic riêng, chỉ cần nhận ticketId rồi
      // đi tiếp y hệt luồng auto-match (matched → xác nhận → vào phòng). Không nhận khi ĐANG có
      // ticket khác — tránh nhảy khỏi phiên đang xử lý dở.
      if (ticketId === null) setTicketId(data.ticketId);
    },
  );
  useRealtimeEvent<MatchConfirmedEventData>(
    RealtimeEvents.MatchConfirmed,
    (data) => {
      if (data.ticketId === ticketId) invalidateTicket();
    },
  );

  const ticket = ticketQuery.data;

  useEffect(() => {
    if (ticket?.status !== 'confirmed' || ticket.sessionId === null) return;
    const dest =
      ticket.matchType === 'soul'
        ? `/matching/soul/${ticket.sessionId}`
        : `/matching/voice/${ticket.sessionId}`;
    router.replace(dest);
  }, [ticket, router]);

  if (ticketId === null) {
    return <MatchTypePicker onJoined={(joined) => setTicketId(joined.id)} />;
  }

  if (ticketQuery.isPending) {
    return (
      <p className="text-center text-sm text-slate-500 dark:text-slate-400">
        Đang tải trạng thái…
      </p>
    );
  }

  if (ticketQuery.isError) {
    const message = isApiError(ticketQuery.error)
      ? ticketQuery.error.message
      : 'Có lỗi xảy ra, thử lại.';
    return (
      <div className={`${STATE_CARD} space-y-3 p-5`}>
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
        <Button
          type="button"
          variant="secondary"
          className={`w-full ${OUTLINE_PILL}`}
          onClick={() => setTicketId(null)}
        >
          Quay lại
        </Button>
      </div>
    );
  }

  if (ticket === undefined) return null;

  switch (ticket.status) {
    case 'queued':
      return (
        <div
          className={`${STATE_CARD} flex flex-col items-center gap-6 px-8 py-10 text-center`}
        >
          <div className="relative flex h-40 w-40 items-center justify-center">
            <span className="pulsering absolute h-40 w-40 rounded-full border border-iris/40" />
            <span className="pulsering2 absolute h-40 w-40 rounded-full border border-iris/40" />
            <div className="relative z-10 flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-irisl to-irisl text-4xl">
              🔮
            </div>
          </div>
          <div className="space-y-1">
            <p className="font-display text-lg italic">
              Đang tìm người ghép đôi…
            </p>
            <p className="font-mono text-xs text-slate-500 dark:text-slate-400">
              (vào hàng đợi lúc{' '}
              {new Date(ticket.enqueuedAt).toLocaleTimeString('vi-VN')})
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <SpeedupButton ticketId={ticket.id} />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className={OUTLINE_PILL}
              disabled={cancelTicket.isPending}
              onClick={() => cancelTicket.mutate()}
            >
              {cancelTicket.isPending ? 'Đang huỷ…' : 'Huỷ'}
            </Button>
          </div>
        </div>
      );
    case 'matched':
      return (
        <div
          className={`${STATE_CARD} flex flex-col items-center gap-4 px-6 py-8 text-center`}
        >
          <p className="font-display text-lg italic">Đã tìm thấy đối phương</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Xác nhận sớm để bắt đầu, nếu không ticket sẽ hết hạn.
          </p>
          <Button
            type="button"
            className="w-full"
            disabled={confirmTicket.isPending}
            onClick={() => confirmTicket.mutate()}
          >
            {confirmTicket.isPending ? 'Đang xác nhận…' : 'Xác nhận'}
          </Button>
        </div>
      );
    case 'confirmed':
      return (
        <p className="text-center text-sm text-slate-500 dark:text-slate-400">
          Đã xác nhận — đang chuyển vào phòng…
        </p>
      );
    case 'expired':
    case 'cancelled':
      return (
        <div
          className={`${STATE_CARD} flex flex-col items-center gap-4 px-6 py-8 text-center`}
        >
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {ticket.status === 'expired'
              ? 'Ticket đã hết hạn.'
              : 'Đã huỷ ticket.'}
          </p>
          <Button
            type="button"
            variant="secondary"
            className={OUTLINE_PILL}
            onClick={() => setTicketId(null)}
          >
            Tìm lại
          </Button>
        </div>
      );
  }
}
