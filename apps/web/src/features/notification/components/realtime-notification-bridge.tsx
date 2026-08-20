'use client';

import { RealtimeEvents } from '@litmatch/common-dtos/pure';
import { useQueryClient } from '@tanstack/react-query';
import { usePathname } from 'next/navigation';
import { useCallback } from 'react';

import { useCurrentUser } from '../../../shared/auth/use-current-user';
import { showToast } from '../../../shared/lib/toast-store';
import { useRealtimeEvent } from '../../../shared/realtime/use-realtime-event';
import { friendChatKeys } from '../../friend-chat/api';
import { notificationKeys } from '../api';

import type { FriendMessageEventData } from '@litmatch/common-dtos/pure';

/** Đồng bộ notification/badge/toast tức thì; REST vẫn là nguồn reconcile sau reconnect. */
export function RealtimeNotificationBridge() {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const currentUser = useCurrentUser();

  const onFriendMessage = useCallback(
    (data: FriendMessageEventData) => {
      void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
      void queryClient.invalidateQueries({ queryKey: friendChatKeys.friends });

      if (!currentUser.data?.id || data.senderUserId === currentUser.data.id)
        return;
      if (pathname.startsWith(`/chat/${data.senderUserId}`)) return;

      const preview = data.content.trim();
      showToast(
        preview.length > 0 ? `Tin nhắn mới: ${preview}` : 'Bạn có tin nhắn mới',
      );
      if (
        typeof window !== 'undefined' &&
        'Notification' in window &&
        window.Notification.permission === 'granted'
      ) {
        try {
          new window.Notification('Tin nhắn mới', {
            body: preview || 'Bạn có tin nhắn mới trên Litmatch.',
            tag: `litmatch-message-${data.senderUserId}`,
          });
        } catch {
          // Browser may reject notifications after a permission/context change; toast vẫn đủ.
        }
      }
    },
    [currentUser.data?.id, pathname, queryClient],
  );

  useRealtimeEvent<FriendMessageEventData>(
    RealtimeEvents.FriendMessage,
    onFriendMessage,
  );
  return null;
}
