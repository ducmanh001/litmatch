'use client';

import { isApiError } from '@litmatch/api-client';
import { RealtimeEvents } from '@litmatch/common-dtos/pure';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { useRealtimeEvent } from '../../../shared/realtime/use-realtime-event';
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

const primaryButtonClass =
  'h-10 w-full rounded-md bg-primary font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50';
const secondaryButtonClass =
  'h-10 w-full rounded-md border border-border font-medium hover:bg-card disabled:opacity-50';

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
      if (data.ticketId === ticketId) invalidateTicket();
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
      <p className="text-sm text-muted-foreground">Đang tải trạng thái…</p>
    );
  }

  if (ticketQuery.isError) {
    const message = isApiError(ticketQuery.error)
      ? ticketQuery.error.message
      : 'Có lỗi xảy ra, thử lại.';
    return (
      <div className="space-y-3">
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
        <button
          type="button"
          className={secondaryButtonClass}
          onClick={() => setTicketId(null)}
        >
          Quay lại
        </button>
      </div>
    );
  }

  if (ticket === undefined) return null;

  switch (ticket.status) {
    case 'queued':
      return (
        <div className="space-y-3">
          <p className="text-sm">
            Đang tìm người ghép đôi… (vào hàng đợi lúc{' '}
            {new Date(ticket.enqueuedAt).toLocaleTimeString('vi-VN')})
          </p>
          <div className="flex flex-wrap items-start gap-2">
            <SpeedupButton ticketId={ticket.id} />
            <button
              type="button"
              className="h-9 rounded-md border border-border px-3 text-sm hover:bg-card disabled:opacity-50"
              disabled={cancelTicket.isPending}
              onClick={() => cancelTicket.mutate()}
            >
              {cancelTicket.isPending ? 'Đang huỷ…' : 'Huỷ'}
            </button>
          </div>
        </div>
      );
    case 'matched':
      return (
        <div className="space-y-3">
          <p className="text-sm">
            Đã tìm thấy đối phương — xác nhận sớm để bắt đầu, nếu không ticket
            sẽ hết hạn.
          </p>
          <button
            type="button"
            className={primaryButtonClass}
            disabled={confirmTicket.isPending}
            onClick={() => confirmTicket.mutate()}
          >
            {confirmTicket.isPending ? 'Đang xác nhận…' : 'Xác nhận'}
          </button>
        </div>
      );
    case 'confirmed':
      return (
        <p className="text-sm text-muted-foreground">
          Đã xác nhận — đang chuyển vào phòng…
        </p>
      );
    case 'expired':
    case 'cancelled':
      return (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {ticket.status === 'expired'
              ? 'Ticket đã hết hạn.'
              : 'Đã huỷ ticket.'}
          </p>
          <button
            type="button"
            className={secondaryButtonClass}
            onClick={() => setTicketId(null)}
          >
            Tìm lại
          </button>
        </div>
      );
  }
}
