import {
  useInfiniteQuery,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { apiClient } from '../../shared/api/client';

import type { ApiSchema } from '@litmatch/api-client';

export type PartyRoomDto = ApiSchema<'PartyRoomDto'>;
export type PartyRoomMemberDto = ApiSchema<'PartyRoomMemberDto'>;
export type PartyRole = PartyRoomMemberDto['role'];

const ROOM_LIST_PAGE_LIMIT = 20;

/** Host và speaker publish được — audience bị chặn ở tầng SFU, client phản ánh lại cho nhất quán. */
export function canPublishRole(role: PartyRole | undefined): boolean {
  return role === 'host' || role === 'speaker';
}

export const partyRoomKeys = {
  list: ['party-room', 'list'] as const,
  detail: (roomId: string) => ['party-room', 'detail', roomId] as const,
  profile: (userId: string) => ['party-room', 'profile', userId] as const,
};

export function useRoomList(filters?: {
  q?: string;
  category?: PartyRoomDto['category'];
}) {
  return useInfiniteQuery({
    queryKey: [
      ...partyRoomKeys.list,
      filters?.q ?? '',
      filters?.category ?? 'all',
    ],
    queryFn: async ({ pageParam }) => {
      const res = await apiClient.GET('/api/v1/party/rooms', {
        params: {
          query: {
            limit: ROOM_LIST_PAGE_LIMIT,
            cursor: pageParam,
            q: filters?.q || undefined,
            category: filters?.category,
          },
        },
      });
      return res.data;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage?.meta.nextCursor ?? undefined,
  });
}

export function useCreateRoom() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      title: string;
      category: PartyRoomDto['category'];
    }) => {
      const res = await apiClient.POST('/api/v1/party/rooms', {
        body: input,
      });
      return res.data?.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: partyRoomKeys.list });
    },
  });
}

/** Poll fallback y như mọi feature khác — realtime chỉ là gợi ý refetch sớm. */
export function useRoomDetail(roomId: string) {
  return useQuery({
    queryKey: partyRoomKeys.detail(roomId),
    queryFn: async () => {
      const res = await apiClient.GET('/api/v1/party/rooms/{id}', {
        params: { path: { id: roomId } },
      });
      return res.data?.data;
    },
    refetchInterval: 5000,
  });
}

export function useJoinRoom(roomId: string) {
  return useMutation({
    mutationFn: async () => {
      const res = await apiClient.POST('/api/v1/party/rooms/{id}/join', {
        params: { path: { id: roomId } },
      });
      return res.data?.data;
    },
  });
}

export function useLeaveRoom(roomId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await apiClient.POST('/api/v1/party/rooms/{id}/leave', {
        params: { path: { id: roomId } },
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: partyRoomKeys.detail(roomId),
      });
      void queryClient.invalidateQueries({ queryKey: partyRoomKeys.list });
    },
  });
}

export function useChangeRole(roomId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      userId: string;
      role: 'speaker' | 'audience';
    }) => {
      const res = await apiClient.POST(
        '/api/v1/party/rooms/{id}/members/{userId}/role',
        {
          params: { path: { id: roomId, userId: input.userId } },
          body: { role: input.role },
        },
      );
      return res.data?.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: partyRoomKeys.detail(roomId),
      });
    },
  });
}

/** Catalog quà công khai — dùng chung cho mọi phòng, không phụ thuộc roomId. */
export function useGiftCatalog() {
  return useQuery({
    queryKey: ['gifts', 'catalog'] as const,
    queryFn: async () => {
      const res = await apiClient.GET('/api/v1/gifts');
      return res.data?.data ?? [];
    },
  });
}

/** Tặng quà trong phòng — trừ DIA người tặng, cần Idempotency-Key theo intent (docs/05 § 5.10). */
export function useSendGift(roomId: string) {
  return useMutation({
    mutationFn: async (input: {
      giftId: string;
      receiverUserId: string;
      idempotencyKey: string;
    }) => {
      const res = await apiClient.POST('/api/v1/party/rooms/{roomId}/gifts', {
        params: {
          path: { roomId },
          header: { 'Idempotency-Key': input.idempotencyKey },
        },
        body: {
          giftId: input.giftId,
          receiverUserId: input.receiverUserId,
        },
      });
      return res.data?.data;
    },
  });
}

/** Host + speaker chỉ tối đa ~9 người — fetch profile riêng từng id là hợp lý (docs/13). */
export function useUserProfiles(userIds: string[]) {
  return useQueries({
    queries: userIds.map((userId) => ({
      queryKey: partyRoomKeys.profile(userId),
      queryFn: async () => {
        const res = await apiClient.GET('/api/v1/users/{id}', {
          params: { path: { id: userId } },
        });
        return res.data?.data;
      },
    })),
  });
}
