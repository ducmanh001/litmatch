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
    mutationFn: async (input: { content: string; idempotencyKey: string }) => {
      const res = await apiClient.POST('/api/v1/conversations/{id}/messages', {
        params: {
          path: { id: conversationId },
          header: { 'Idempotency-Key': input.idempotencyKey },
        },
        body: { content: input.content },
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
