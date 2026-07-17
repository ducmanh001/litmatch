'use client';

import { isApiError } from '@litmatch/api-client';
import { RealtimeEvents } from '@litmatch/common-dtos/pure';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';

import { useRealtimeEvent } from '../../../shared/realtime/use-realtime-event';
import { ProfileIcon } from '../../../shared/ui/icons';
import { soulMatchKeys, useSoulSession } from '../api';
import { SoulMessageComposer } from './soul-message-composer';
import { SoulMessageList } from './soul-message-list';
import { SoulPartnerCard } from './soul-partner-card';
import { SoulRatingButtons } from './soul-rating-buttons';
import { SoulResultScreen } from './soul-result-screen';

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

  // Đã gửi đánh giá (thích/bỏ qua) — chuyển thẳng sang màn kết quả toàn màn hình, không đợi
  // phase chuyển 'closed' (giống soul-match.html: rate() → showOnly('resultState') ngay lập tức).
  if (s.myVerdict !== null) {
    return (
      <SoulResultScreen
        sessionId={sessionId}
        verdict={s.myVerdict}
        matched={s.matched}
      />
    );
  }

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
          cả 2 đã thích nhau dù vẫn còn đang chat/đánh giá. Trước khi matched, vẫn hiện đúng
          header "người lạ ẩn danh" của soul-match.html (#chatState) — chỉ là copy tĩnh phản
          ánh đúng trạng thái danh tính đang ẩn, không phải dữ liệu bịa. */}
      {s.matched ? (
        <SoulPartnerCard sessionId={sessionId} />
      ) : (
        <div className="flex items-center gap-3 border-b border-black/5 px-5 pb-3 dark:border-white/5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surf2">
            <ProfileIcon width={18} height={18} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold">Người lạ ẩn danh</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Hồ sơ ẩn cho tới khi cả 2 cùng thích
            </p>
          </div>
        </div>
      )}
      <SoulMessageList sessionId={sessionId} />
      {s.phase === 'chatting' && <SoulMessageComposer sessionId={sessionId} />}
      <SoulRatingButtons sessionId={sessionId} myVerdict={s.myVerdict} />
    </div>
  );
}
