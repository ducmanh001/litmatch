'use client';

import { isApiError } from '@litmatch/api-client';
import { RealtimeEvents } from '@litmatch/common-dtos/pure';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { confirmAction, confirmStore } from '../../../shared/lib/confirm-store';
import { showToast } from '../../../shared/lib/toast-store';
import { useRealtimeEvent } from '../../../shared/realtime/use-realtime-event';
import { MicIcon } from '../../../shared/ui/icons';
import {
  friendChatKeys,
  useBlockUser,
  useConversationWithFriend,
  usePartnerProfile,
} from '../api';
import { FriendAvatar } from './friend-avatar';
import { MessageComposer } from './message-composer';
import { MessageList } from './message-list';

import type { FriendMessageEventData } from '@litmatch/common-dtos/pure';

// Đúng lmCloseConfirm() + setTimeout(fn, 320) ở chat.html — đóng sheet "Tuỳ chọn" trước rồi mới
// mở bước tiếp theo (toast tắt thông báo, hoặc confirm chặn) để 2 bottom-sheet không đè animation.
const MENU_CLOSE_DELAY_MS = 320;

export function ConversationThread({ friendUserId }: { friendUserId: string }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [muted, setMuted] = useState(false);
  const blockUser = useBlockUser();
  // Route theo friendUserId (không phải conversationId) — conversation rỗng tin nhắn thì
  // không có cách nào suy ra partner từ lịch sử chat; resolve cả 2 độc lập từ URL param.
  const partner = usePartnerProfile(friendUserId);
  const conversation = useConversationWithFriend(friendUserId);

  useRealtimeEvent<FriendMessageEventData>(
    RealtimeEvents.FriendMessage,
    (data) => {
      const conversationId = conversation.data?.id;
      if (
        conversationId !== undefined &&
        data.conversationId === conversationId
      ) {
        void queryClient.invalidateQueries({
          queryKey: friendChatKeys.messages(conversationId),
        });
      }
    },
  );

  if (partner.isPending || conversation.isPending) {
    return (
      <p className="px-5 text-sm text-slate-500 dark:text-slate-400">
        Đang tải…
      </p>
    );
  }

  if (partner.isError || conversation.isError) {
    const error = partner.isError ? partner.error : conversation.error;
    const message = isApiError(error)
      ? error.message
      : 'Có lỗi xảy ra, thử lại.';
    return (
      <p role="alert" className="px-5 text-sm text-destructive">
        {message}
      </p>
    );
  }

  if (partner.data === undefined || conversation.data === undefined) {
    return null;
  }

  // Const riêng để TS giữ narrowing (partner.data đã loại undefined ở check trên) khi tham
  // chiếu trong các closure onClick định nghĩa bên dưới — access qua `partner.data` trực tiếp
  // trong closure sẽ bị widen lại thành `... | undefined`.
  const partnerData = partner.data;

  // Đúng lmConfirm('Linh', 'Tuỳ chọn cuộc trò chuyện', ...) ở chat.html — 4 mục: xem hồ sơ
  // (chưa có route xem hồ sơ người khác → để "sắp có"), tắt/bật thông báo (client state thuần —
  // không có API mute conversation), chặn (Safety module thật), báo cáo.
  const openOptionsMenu = () => {
    void confirmAction({
      title: partnerData.nickname,
      message: 'Tuỳ chọn cuộc trò chuyện',
      actionLabel: 'Đóng',
      content: (
        <div className="mb-5 space-y-2">
          <p
            aria-label="Xem hồ sơ (sắp có)"
            className="flex w-full cursor-not-allowed items-center gap-3 rounded-xl bg-slate-100 px-4 py-3 text-left text-sm font-semibold opacity-50 dark:bg-surf2"
          >
            👤 Xem hồ sơ
          </p>
          <button
            type="button"
            onClick={handleToggleMute}
            className="flex w-full items-center gap-3 rounded-xl bg-slate-100 px-4 py-3 text-left text-sm font-semibold dark:bg-surf2"
          >
            🔕 {muted ? 'Bật lại thông báo' : 'Tắt thông báo'}
          </button>
          <button
            type="button"
            onClick={handleBlock}
            className="flex w-full items-center gap-3 rounded-xl bg-rose-500/10 px-4 py-3 text-left text-sm font-semibold text-rose-500"
          >
            🚫 Chặn người này
          </button>
          <button
            type="button"
            onClick={handleReport}
            className="flex w-full items-center gap-3 rounded-xl bg-rose-500/10 px-4 py-3 text-left text-sm font-semibold text-rose-500"
          >
            ⚠️ Báo cáo
          </button>
        </div>
      ),
    });
  };

  // Đóng menu tuỳ chọn hiện tại rồi mới chạy bước kế tiếp — đúng thứ tự lmCloseConfirm() +
  // setTimeout(fn, 320) ở chat.html (2 bottom-sheet không mở chồng nhau giữa lúc animation).
  const closeMenuThen = (next: () => void) => {
    confirmStore.resolve(false);
    setTimeout(next, MENU_CLOSE_DELAY_MS);
  };

  // Mute là state UI thuần phía client — không có API "mute conversation" ở BE (docs/13 §13.1:
  // không bịa network call cho state không tồn tại), chỉ tắt tiếng thông báo local.
  const handleToggleMute = () => {
    closeMenuThen(() => {
      const next = !muted;
      setMuted(next);
      showToast(
        next
          ? `Đã tắt thông báo từ ${partnerData.nickname}`
          : 'Đã bật lại thông báo',
      );
    });
  };

  const handleBlock = () => {
    closeMenuThen(() => {
      void (async () => {
        const confirmed = await confirmAction({
          title: `Chặn ${partnerData.nickname}?`,
          message: `${partnerData.nickname} sẽ không thể nhắn tin hoặc xem hồ sơ của bạn nữa.`,
          tone: 'danger',
          actionLabel: 'Chặn',
        });
        if (!confirmed) return;
        try {
          await blockUser.mutateAsync(partnerData.id);
          showToast(`Đã chặn ${partnerData.nickname}`, 'warn');
          router.push('/friends');
        } catch (error) {
          showToast(
            isApiError(error) ? error.message : 'Có lỗi xảy ra, thử lại.',
            'warn',
          );
        }
      })();
    });
  };

  // Mockup cũng không có picker lý do report thật — chỉ điều hướng sang trang an toàn
  // (privacy.html). Trang /privacy thật cũng theo đúng quyết định đó (bỏ report-reason giả).
  const handleReport = () => {
    closeMenuThen(() => router.push('/privacy'));
  };

  return (
    <div className="flex flex-col">
      <div className="bg-paper dark:bg-ink sticky top-0 z-10 flex items-center gap-3 border-b border-black/5 px-5 pb-4 pt-2 dark:border-white/10">
        <Link
          href="/friends"
          aria-label="Quay lại danh sách bạn bè"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-surf2"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            aria-hidden
          >
            <path
              d="M15 18l-6-6 6-6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
        <FriendAvatar
          userId={partner.data.id}
          nickname={partner.data.nickname}
        />
        <h1 className="min-w-0 flex-1 truncate text-sm font-bold">
          {partner.data.nickname}
        </h1>
        <button
          type="button"
          disabled
          aria-label="Voice Match (sắp có)"
          className="bg-iris/10 text-irisl flex h-9 w-9 shrink-0 items-center justify-center rounded-full opacity-50"
        >
          <MicIcon width={16} height={16} />
        </button>
        <button
          type="button"
          onClick={openOptionsMenu}
          aria-label="Tuỳ chọn cuộc trò chuyện"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-surf2"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden
          >
            <circle cx={5} cy={12} r={1.5} />
            <circle cx={12} cy={12} r={1.5} />
            <circle cx={19} cy={12} r={1.5} />
          </svg>
        </button>
      </div>
      <div className="px-5 py-4">
        <MessageList conversationId={conversation.data.id} />
      </div>
      <div className="bg-paper dark:bg-ink sticky bottom-16 z-10 border-t border-black/5 px-5 py-3 md:bottom-0 dark:border-white/10">
        <MessageComposer conversationId={conversation.data.id} />
      </div>
    </div>
  );
}
