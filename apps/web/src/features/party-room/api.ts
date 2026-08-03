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
export type PartyRoomCommentDto = ApiSchema<'PartyRoomCommentDto'>;
export type PartyRoomCommentsPageDto = ApiSchema<'PartyRoomCommentsPageDto'>;
export type PartyRole = PartyRoomMemberDto['role'];

const ROOM_LIST_PAGE_LIMIT = 20;
const ROOM_COMMENT_PAGE_LIMIT = 30;

export const PARTY_ROOM_DETAIL_REFETCH_INTERVAL_MS = 5_000;

/** Host và speaker publish được — audience bị chặn ở tầng SFU, client phản ánh lại cho nhất quán. */
export function canPublishRole(role: PartyRole | undefined): boolean {
  return role === 'host' || role === 'speaker';
}

export const partyRoomKeys = {
  list: ['party-room', 'list'] as const,
  detail: (roomId: string) => ['party-room', 'detail', roomId] as const,
  comments: (roomId: string) => ['party-room', 'comments', roomId] as const,
  profile: (userId: string) => ['party-room', 'profile', userId] as const,
};

/** Phòng đã đóng là terminal, không còn delta room detail để fallback REST phải lấy. */
export function isActiveRoomStatus(
  status: PartyRoomDto['status'] | undefined,
): boolean {
  return status !== undefined && status !== 'closed';
}

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

/** Poll fallback khi phòng còn mở — realtime chỉ là gợi ý refetch sớm. */
export function useRoomDetail(roomId: string) {
  return useQuery({
    queryKey: partyRoomKeys.detail(roomId),
    queryFn: async () => {
      const res = await apiClient.GET('/api/v1/party/rooms/{id}', {
        params: { path: { id: roomId } },
      });
      return res.data?.data;
    },
    refetchInterval: (query) =>
      isActiveRoomStatus(query.state.data?.room.status)
        ? PARTY_ROOM_DETAIL_REFETCH_INTERVAL_MS
        : false,
  });
}

export function useJoinRoom(roomId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiClient.POST('/api/v1/party/rooms/{id}/join', {
        params: { path: { id: roomId } },
      });
      return res.data?.data;
    },
    onSuccess: (joined) => {
      if (joined === undefined) return;
      queryClient.setQueryData<
        { room: PartyRoomDto; members: PartyRoomMemberDto[] } | undefined
      >(partyRoomKeys.detail(roomId), (current) => {
        if (current === undefined) return current;
        const members = current.members.some(
          (member) => member.userId === joined.membership.userId,
        )
          ? current.members.map((member) =>
              member.userId === joined.membership.userId
                ? { ...member, ...joined.membership }
                : member,
            )
          : [...current.members, joined.membership];
        return { room: joined.room, members };
      });
      void queryClient.invalidateQueries({ queryKey: partyRoomKeys.list });
    },
  });
}

/** Lấy các comment mới nhất; cursor trang sau đi lùi về comment cũ hơn. */
export function useRoomComments(roomId: string) {
  return useInfiniteQuery({
    queryKey: partyRoomKeys.comments(roomId),
    queryFn: async ({ pageParam }) => {
      const res = await apiClient.GET('/api/v1/party/rooms/{id}/comments', {
        params: {
          path: { id: roomId },
          query: { limit: ROOM_COMMENT_PAGE_LIMIT, cursor: pageParam },
        },
      });
      return res.data?.data;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage?.meta.nextCursor ?? undefined,
    refetchInterval: PARTY_ROOM_DETAIL_REFETCH_INTERVAL_MS,
  });
}

export function useSendRoomComment(roomId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { content: string; idempotencyKey: string }) => {
      const res = await apiClient.POST('/api/v1/party/rooms/{id}/comments', {
        params: {
          path: { id: roomId },
          header: { 'Idempotency-Key': input.idempotencyKey },
        },
        body: { content: input.content },
      });
      return res.data?.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: partyRoomKeys.comments(roomId),
      });
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
    mutationFn: async (input: { userId: string; role: 'audience' }) => {
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

/** Host chỉ gửi lời mời; role vẫn audience cho tới khi target accept. */
export function useInviteSpeaker(roomId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiClient.POST(
        '/api/v1/party/rooms/{id}/members/{userId}/speaker-invite',
        { params: { path: { id: roomId, userId } } },
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

export function useAcceptSpeakerInvite(roomId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiClient.POST(
        '/api/v1/party/rooms/{id}/speaker-invite/accept',
        { params: { path: { id: roomId } } },
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

export function useDeclineSpeakerInvite(roomId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiClient.POST(
        '/api/v1/party/rooms/{id}/speaker-invite/decline',
        { params: { path: { id: roomId } } },
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
export function useGiftCatalog(enabled = true) {
  return useQuery({
    queryKey: ['gifts', 'catalog'] as const,
    enabled,
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
