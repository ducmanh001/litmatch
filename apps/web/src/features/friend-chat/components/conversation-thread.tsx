'use client';

import { isApiError } from '@litmatch/api-client';
import { RealtimeEvents } from '@litmatch/common-dtos/pure';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';

import { useRealtimeEvent } from '../../../shared/realtime/use-realtime-event';
import {
  friendChatKeys,
  useConversationWithFriend,
  usePartnerProfile,
} from '../api';
import { FriendAvatar } from './friend-avatar';
import { MessageComposer } from './message-composer';
import { MessageList } from './message-list';

import type { FriendMessageEventData } from '@litmatch/common-dtos/pure';

export function ConversationThread({ friendUserId }: { friendUserId: string }) {
  const queryClient = useQueryClient();
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 border-b border-black/5 px-5 pb-4 pt-2 dark:border-white/10">
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
        <h1 className="text-sm font-bold">{partner.data.nickname}</h1>
      </div>
      <div className="px-5">
        <MessageList conversationId={conversation.data.id} />
      </div>
      <div className="px-5">
        <MessageComposer conversationId={conversation.data.id} />
      </div>
    </div>
  );
}
