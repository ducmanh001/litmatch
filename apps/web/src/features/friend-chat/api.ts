import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { apiClient } from '../../shared/api/client';

import type { ApiSchema } from '@litmatch/api-client';

export type FriendDto = ApiSchema<'FriendDto'>;
export type MessageDto = ApiSchema<'MessageDto'>;

const MESSAGES_PAGE_LIMIT = 30;

export const friendChatKeys = {
  friends: ['friend-chat', 'friends'] as const,
  conversation: (friendUserId: string) =>
    ['friend-chat', 'conversation', friendUserId] as const,
  partnerProfile: (friendUserId: string) =>
    ['friend-chat', 'partner-profile', friendUserId] as const,
  messages: (conversationId: string) =>
    ['friend-chat', 'messages', conversationId] as const,
};

export function useFriends() {
  return useQuery({
    queryKey: friendChatKeys.friends,
    queryFn: async () => {
      const res = await apiClient.GET('/api/v1/friends');
      return res.data?.data;
    },
  });
}

export function useConversationWithFriend(
  friendUserId: string,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: friendChatKeys.conversation(friendUserId),
    queryFn: async () => {
      const res = await apiClient.GET(
        '/api/v1/friends/{friendUserId}/conversation',
        { params: { path: { friendUserId } } },
      );
      return res.data?.data;
    },
    enabled: options?.enabled ?? true,
  });
}

export function usePartnerProfile(friendUserId: string) {
  return useQuery({
    queryKey: friendChatKeys.partnerProfile(friendUserId),
    queryFn: async () => {
      const res = await apiClient.GET('/api/v1/users/{id}', {
        params: { path: { id: friendUserId } },
      });
      return res.data?.data;
    },
    // Caller (vd watch-together-view) truyền '' khi session chưa load xong —
    // chặn GET /users/ với id rỗng (404 vô nghĩa trên console).
    enabled: friendUserId !== '',
  });
}

export function useConversationMessages(conversationId: string) {
  return useInfiniteQuery({
    queryKey: friendChatKeys.messages(conversationId),
    queryFn: async ({ pageParam }) => {
      const res = await apiClient.GET('/api/v1/conversations/{id}/messages', {
        params: {
          path: { id: conversationId },
          query: { limit: MESSAGES_PAGE_LIMIT, cursor: pageParam },
        },
      });
      return res.data?.data;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage?.meta.nextCursor ?? undefined,
    // Chat bạn bè không có "đóng phòng" như Soul Match — poll luôn bật khi hook còn mount,
    // là fallback REST thật khi socket rớt/không có (docs/12 §12.8).
    refetchInterval: 3000,
  });
}

export function useSendFriendMessage(conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      content?: string;
      imageUrl?: string;
      idempotencyKey: string;
    }) => {
      const res = await apiClient.POST('/api/v1/conversations/{id}/messages', {
        params: {
          path: { id: conversationId },
          header: { 'Idempotency-Key': input.idempotencyKey },
        },
        body: { content: input.content, imageUrl: input.imageUrl },
      });
      return res.data?.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: friendChatKeys.messages(conversationId),
      });
    },
  });
}

/**
 * Đánh dấu đã đọc tới hiện tại — gọi khi mở thread và khi có message mới lúc đang xem.
 * Server idempotent nên gọi lặp an toàn; xong thì badge ở danh sách bạn phải cập nhật.
 */
export function useMarkConversationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (conversationId: string) => {
      const res = await apiClient.POST('/api/v1/conversations/{id}/read', {
        params: { path: { id: conversationId } },
      });
      return res.data?.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: friendChatKeys.friends,
      });
    },
  });
}

/** Bật/tắt thông báo hội thoại (persist server) — đúng menu "Tắt thông báo" chat.html. */
export function useMuteConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { conversationId: string; muted: boolean }) => {
      const res = await apiClient.POST('/api/v1/conversations/{id}/mute', {
        params: { path: { id: input.conversationId } },
        body: { muted: input.muted },
      });
      return res.data?.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: friendChatKeys.friends,
      });
    },
  });
}

/**
 * Chặn 1 user thật qua Safety module (POST /safety/blocks/:targetUserId, idempotent) — đúng
 * flow "Chặn Linh?" ở chat.html. Không có mutation "unblock"/"report" nào khác dùng field
 * này lúc viết; nếu 1 feature thứ 2 cần (vd trang riêng tư danh sách đã chặn), tách ra
 * shared/api một khi có 2 nơi dùng thật.
 */
export function useBlockUser() {
  return useMutation({
    mutationFn: async (targetUserId: string) => {
      await apiClient.POST('/api/v1/safety/blocks/{targetUserId}', {
        params: { path: { targetUserId } },
      });
    },
  });
}

export function useReportUser() {
  return useMutation({
    mutationFn: async (input: {
      targetUserId: string;
      reason:
        'harassment' | 'spam' | 'underage' | 'inappropriate_content' | 'other';
    }) => {
      const response = await apiClient.POST('/api/v1/safety/reports', {
        body: input,
      });
      return response.data?.data;
    },
  });
}
