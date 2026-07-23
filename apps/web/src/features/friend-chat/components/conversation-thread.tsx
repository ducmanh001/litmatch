'use client';

import { isApiError } from '@litmatch/api-client';
import { RealtimeEvents } from '@litmatch/common-dtos/pure';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { confirmAction, confirmStore } from '../../../shared/lib/confirm-store';
import { showToast } from '../../../shared/lib/toast-store';
import { useRealtimeEvent } from '../../../shared/realtime/use-realtime-event';
import { MicIcon } from '../../../shared/ui/icons';
import {
  friendChatKeys,
  useBlockUser,
  useConversationWithFriend,
  useFriends,
  useMarkConversationRead,
  useMuteConversation,
  usePartnerProfile,
  useReportUser,
} from '../api';
import { useCreateInvite } from '../../matching/invite-api';
import { FriendAvatar } from './friend-avatar';
import { MessageComposer } from './message-composer';
import { MessageList } from './message-list';

import type { FriendMessageEventData } from '@litmatch/common-dtos/pure';

// Đúng lmCloseConfirm() + setTimeout(fn, 320) ở chat.html — đóng sheet "Tuỳ chọn" trước rồi mới
// mở bước tiếp theo (toast tắt thông báo, hoặc confirm chặn) để 2 bottom-sheet không đè animation.
const MENU_CLOSE_DELAY_MS = 320;

export function ConversationThread({
  friendUserId,
  inDialog = false,
  onBack,
}: {
  friendUserId: string;
  inDialog?: boolean;
  onBack?: () => void;
}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const blockUser = useBlockUser();
  const reportUser = useReportUser();
  const createInvite = useCreateInvite();
  const friends = useFriends();
  const { mutate: markReadMutate } = useMarkConversationRead();
  const muteConversation = useMuteConversation();
  // Route theo friendUserId (không phải conversationId) — conversation rỗng tin nhắn thì
  // không có cách nào suy ra partner từ lịch sử chat; resolve cả 2 độc lập từ URL param.
  const partner = usePartnerProfile(friendUserId);
  const conversation = useConversationWithFriend(friendUserId);
  const conversationId = conversation.data?.id;

  // Đang mở thread = đã đọc: đánh dấu khi vào và mỗi khi có message mới lúc đang xem —
  // server idempotent nên gọi lặp an toàn; badge ở /friends nhờ đó tự về 0.
  useEffect(() => {
    if (conversationId !== undefined) markReadMutate(conversationId);
  }, [conversationId, markReadMutate]);

  useRealtimeEvent<FriendMessageEventData>(
    RealtimeEvents.FriendMessage,
    (data) => {
      if (
        conversationId !== undefined &&
        data.conversationId === conversationId
      ) {
        void queryClient.invalidateQueries({
          queryKey: friendChatKeys.messages(conversationId),
        });
        markReadMutate(conversationId);
      }
    },
  );

  if (partner.isPending || conversation.isPending) {
    return (
      <p className="px-5 text-sm text-slate-500 dark:text-white/70">
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
  const conversationData = conversation.data;

  // Trạng thái mute persist ở server (conversation_member_states) — đọc từ cache /friends.
  const muted =
    friends.data?.find((f) => f.conversationId === conversationData.id)
      ?.muted ?? false;

  // Đúng lmConfirm('Linh', 'Tuỳ chọn cuộc trò chuyện', ...) ở chat.html — mọi mục đều có
  // hành vi thật: public profile, preference mute, block và report qua Safety.
  const openOptionsMenu = () => {
    void confirmAction({
      title: partnerData.nickname,
      message: 'Tuỳ chọn cuộc trò chuyện',
      actionLabel: 'Đóng',
      content: (
        <div className="mb-5 space-y-2">
          <button
            type="button"
            onClick={() =>
              closeMenuThen(() => router.push(`/users/${partnerData.id}`))
            }
            className="flex w-full items-center gap-3 rounded-xl bg-slate-100 px-4 py-3 text-left text-sm font-semibold dark:bg-surf2"
          >
            👤 Xem hồ sơ
          </button>
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

  // Mute persist ở server — notification friend_message bị bỏ qua ở BE khi đang mute.
  const handleToggleMute = () => {
    closeMenuThen(() => {
      const next = !muted;
      muteConversation.mutate(
        { conversationId: conversationData.id, muted: next },
        {
          onSuccess: () =>
            showToast(
              next
                ? `Đã tắt thông báo từ ${partnerData.nickname}`
                : 'Đã bật lại thông báo',
            ),
          onError: (error) =>
            showToast(
              isApiError(error) ? error.message : 'Có lỗi xảy ra, thử lại.',
              'warn',
            ),
        },
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

  const handleReport = () => {
    closeMenuThen(() => {
      void confirmAction({
        title: `Báo cáo ${partnerData.nickname}`,
        message: 'Chọn lý do phù hợp nhất',
        actionLabel: 'Đóng',
        content: (
          <div className="mb-5 grid gap-2">
            {REPORT_REASONS.map((reason) => (
              <button
                key={reason.value}
                type="button"
                disabled={reportUser.isPending}
                onClick={() => {
                  void reportUser
                    .mutateAsync({
                      targetUserId: partnerData.id,
                      reason: reason.value,
                    })
                    .then(() => {
                      confirmStore.resolve(false);
                      showToast(
                        'Đã gửi báo cáo. Cảm ơn bạn đã giúp cộng đồng an toàn hơn.',
                      );
                    })
                    .catch((error: unknown) =>
                      showToast(
                        isApiError(error)
                          ? error.message
                          : 'Không thể gửi báo cáo.',
                        'warn',
                      ),
                    );
                }}
                className="rounded-xl bg-rose-500/10 px-4 py-3 text-left text-sm font-semibold text-rose-500 disabled:opacity-50"
              >
                {reason.label}
              </button>
            ))}
          </div>
        ),
      });
    });
  };

  const handleVoiceInvite = () => {
    createInvite.mutate(
      { inviteeUserId: partnerData.id, matchType: 'voice' },
      {
        onSuccess: () =>
          showToast(`Đã mời ${partnerData.nickname} tham gia Voice Match`),
        onError: (error) =>
          showToast(
            isApiError(error) ? error.message : 'Không thể gửi lời mời.',
            'warn',
          ),
      },
    );
  };

  return (
    <div
      className={`flex flex-col bg-card/40 dark:bg-surf/20 ${
        inDialog ? 'min-h-0 flex-1' : 'min-h-[calc(100dvh-8rem)]'
      }`}
    >
      <div className="bg-paper/90 dark:bg-ink/90 sticky top-0 z-10 flex items-center gap-3 border-b border-black/5 px-5 pb-3 pt-2 backdrop-blur dark:border-white/10">
        {onBack === undefined ? (
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
        ) : (
          <button
            type="button"
            onClick={onBack}
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
          </button>
        )}
        <FriendAvatar
          userId={partner.data.id}
          nickname={partner.data.nickname}
        />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-bold">
            {partner.data.nickname}
          </h1>
          <p className="truncate text-xs font-medium text-muted-foreground dark:text-white/60">
            Bạn bè trên Litmatch
          </p>
        </div>
        <button
          type="button"
          disabled={createInvite.isPending}
          onClick={handleVoiceInvite}
          aria-label="Mời Voice Match"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-aqua/20 via-iris/15 to-irisl/25 text-irisl transition hover:brightness-110 disabled:opacity-50"
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
      <div
        className={`flex-1 px-5 py-4 ${
          inDialog ? 'min-h-0 overflow-y-auto' : ''
        }`}
      >
        <MessageList conversationId={conversation.data.id} />
      </div>
      <div
        className={`bg-paper/90 dark:bg-ink/90 sticky z-10 border-t border-black/5 px-5 py-3 backdrop-blur dark:border-white/10 ${
          inDialog ? 'bottom-0' : 'bottom-16 md:bottom-0'
        }`}
      >
        <MessageComposer conversationId={conversation.data.id} />
      </div>
    </div>
  );
}

const REPORT_REASONS = [
  { value: 'harassment', label: 'Quấy rối hoặc bắt nạt' },
  { value: 'spam', label: 'Spam hoặc lừa đảo' },
  { value: 'underage', label: 'Nghi ngờ vị thành niên' },
  { value: 'inappropriate_content', label: 'Nội dung không phù hợp' },
  { value: 'other', label: 'Lý do khác' },
] as const;
