import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '../../shared/api/client';

import type { ApiSchema } from '@litmatch/api-client';

export type MatchInviteDto = ApiSchema<'MatchInviteDto'>;
export type MatchInviteAcceptedDto = ApiSchema<'MatchInviteAcceptedDto'>;

export const inviteKeys = {
  received: ['matching', 'invites', 'received'] as const,
};

/** CTA "mời Voice/Soul Match" từ Discovery/Nearby — invite tái dùng pipeline MatchTicket/Session,
 * KHÔNG phải friend-request mới (docs/services/matching-service.md § Invite). */
export function useCreateInvite() {
  return useMutation({
    mutationFn: async (input: {
      inviteeUserId: string;
      matchType: 'soul' | 'voice';
    }) => {
      const res = await apiClient.POST('/api/v1/matching/invites', {
        body: input,
      });
      return res.data?.data;
    },
  });
}

/** Danh sách lời mời ĐANG CHỜ (pending) gửi tới chính mình — hiện ở đầu trang /matching. */
export function useReceivedInvites() {
  return useQuery({
    queryKey: inviteKeys.received,
    queryFn: async () => {
      const res = await apiClient.GET('/api/v1/matching/invites');
      return res.data?.data;
    },
  });
}

export function useAcceptInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (inviteId: string) => {
      const res = await apiClient.POST('/api/v1/matching/invites/{id}/accept', {
        params: { path: { id: inviteId } },
      });
      return res.data?.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: inviteKeys.received });
    },
  });
}

export function useDeclineInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (inviteId: string) => {
      const res = await apiClient.POST(
        '/api/v1/matching/invites/{id}/decline',
        { params: { path: { id: inviteId } } },
      );
      return res.data?.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: inviteKeys.received });
    },
  });
}
