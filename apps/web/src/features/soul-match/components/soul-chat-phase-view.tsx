'use client';

import { isApiError } from '@litmatch/api-client';
import { RealtimeEvents } from '@litmatch/common-dtos/pure';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';

import { useRealtimeEvent } from '../../../shared/realtime/use-realtime-event';
import { soulMatchKeys, useSoulSession } from '../api';
import { SoulMessageComposer } from './soul-message-composer';
import { SoulMessageList } from './soul-message-list';
import { SoulPartnerCard } from './soul-partner-card';
import { SoulRatingButtons } from './soul-rating-buttons';

import type {
  SoulMatchedEventData,
  SoulMessageEventData,
} from '@litmatch/common-dtos/pure';

export function SoulChatPhaseView({ sessionId }: { sessionId: string }) {
  const queryClient = useQueryClient();
  const session = useSoulSession(sessionId);

  // Realtime chỉ gợi ý refetch sớm — poll của useSoulSession vẫn là fallback thật.
  useRealtimeEvent<SoulMessageEventData>(RealtimeEvents.SoulMessage, (data) => {
    if (data.sessionId === sessionId) {
      void queryClient.invalidateQueries({
        queryKey: soulMatchKeys.messages(sessionId),
      });
    }
  });
  useRealtimeEvent<SoulMatchedEventData>(RealtimeEvents.SoulMatched, (data) => {
    if (data.sessionId === sessionId) {
      void queryClient.invalidateQueries({
        queryKey: soulMatchKeys.session(sessionId),
      });
    }
  });

  if (session.isPending) {
    return (
      <p className="px-5 py-4 text-center text-sm text-slate-500 dark:text-slate-400">
        Đang tải phòng chat…
      </p>
    );
  }

  if (session.isError) {
    const message = isApiError(session.error)
      ? session.error.message
      : 'Có lỗi xảy ra, thử lại.';
    return (
      <p role="alert" className="px-5 py-4 text-sm text-destructive">
        {message}
      </p>
    );
  }

  const s = session.data;
  if (s === undefined) return null;

  if (s.phase === 'closed') {
    return (
      <div className="flex flex-1 flex-col">
        {s.matched && <SoulPartnerCard sessionId={sessionId} />}
        <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
          {!s.matched && (
            <p className="mb-8 text-sm text-slate-500 dark:text-slate-400">
              Không match lần này — lịch sử chat ẩn danh không đọc lại được nữa.
            </p>
          )}
          <Link
            href="/matching"
            className="w-full rounded-full bg-gradient-to-br from-irisl to-irisl py-3 text-center text-sm font-bold text-white shadow-lg shadow-iris/30"
          >
            Tìm ghép đôi tiếp
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      {/* `matched` là live check (Friendship), không đợi phase sang closed — báo ngay khi
          cả 2 đã thích nhau dù vẫn còn đang chat/đánh giá. */}
      {s.matched && <SoulPartnerCard sessionId={sessionId} />}
      <SoulMessageList sessionId={sessionId} />
      {s.phase === 'chatting' && <SoulMessageComposer sessionId={sessionId} />}
      <SoulRatingButtons sessionId={sessionId} myVerdict={s.myVerdict} />
    </div>
  );
}
