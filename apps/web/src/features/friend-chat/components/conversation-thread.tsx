'use client';

import { isApiError } from '@litmatch/api-client';
import { RealtimeEvents } from '@litmatch/common-dtos/pure';
import { useQueryClient } from '@tanstack/react-query';

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
    return <p className="text-sm text-muted-foreground">Đang tải…</p>;
  }

  if (partner.isError || conversation.isError) {
    const error = partner.isError ? partner.error : conversation.error;
    const message = isApiError(error)
      ? error.message
      : 'Có lỗi xảy ra, thử lại.';
    return (
      <p role="alert" className="text-sm text-destructive">
        {message}
      </p>
    );
  }

  if (partner.data === undefined || conversation.data === undefined) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <FriendAvatar
          userId={partner.data.id}
          nickname={partner.data.nickname}
        />
        <h1 className="text-xl font-semibold">{partner.data.nickname}</h1>
      </div>
      <MessageList conversationId={conversation.data.id} />
      <MessageComposer conversationId={conversation.data.id} />
    </div>
  );
}
