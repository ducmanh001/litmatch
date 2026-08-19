import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '../../shared/api/client';
import { currentUserKey } from '../../shared/auth/use-current-user';

import type { ApiSchema } from '@litmatch/api-client';

export type UpdateProfileDto = ApiSchema<'UpdateProfileDto'>;
export type PublicProfileDto = ApiSchema<'PublicProfileDto'>;
export type PublicPresenceDto = ApiSchema<'UserPresenceDto'>;
export type ProfileActionsDto = ApiSchema<'ProfileActionsDto'>;
export type GiftDto = ApiSchema<'GiftDto'>;

export const profileKeys = {
  public: (id: string) => ['profile', 'public', id] as const,
  presence: (id: string) => ['profile', 'presence', id] as const,
  actions: (id: string) => ['profile', 'actions', id] as const,
};

export function usePublicProfile(id: string) {
  return useQuery({
    queryKey: profileKeys.public(id),
    queryFn: async () => {
      const response = await apiClient.GET('/api/v1/users/{id}', {
        params: { path: { id } },
      });
      return response.data?.data;
    },
  });
}

export function useProfileActions(id: string) {
  return useQuery({
    queryKey: profileKeys.actions(id),
    queryFn: async () => {
      const response = await apiClient.GET(
        '/api/v1/profiles/{profileUserId}/actions',
        { params: { path: { profileUserId: id } } },
      );
      return response.data?.data;
    },
    enabled: id !== '',
  });
}

export function useProfileGiftCatalog(enabled: boolean) {
  return useQuery({
    queryKey: ['gifts', 'catalog'] as const,
    queryFn: async () => {
      const response = await apiClient.GET('/api/v1/gifts');
      return response.data?.data ?? [];
    },
    enabled,
  });
}

export function useFollowProfile(profileUserId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (following: boolean) => {
      if (following) {
        const response = await apiClient.POST(
          '/api/v1/profiles/{profileUserId}/follow',
          { params: { path: { profileUserId } } },
        );
        return response.data?.data;
      }
      const response = await apiClient.DELETE(
        '/api/v1/profiles/{profileUserId}/follow',
        { params: { path: { profileUserId } } },
      );
      return response.data?.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: profileKeys.actions(profileUserId),
      });
    },
  });
}

export function useOpenProfileConversation(profileUserId: string) {
  return useMutation({
    mutationFn: async () => {
      const response = await apiClient.POST(
        '/api/v1/profiles/{profileUserId}/conversation',
        { params: { path: { profileUserId } } },
      );
      return response.data?.data;
    },
  });
}

export function useSendProfileGift(profileUserId: string) {
  return useMutation({
    mutationFn: async (input: { giftId: string; idempotencyKey: string }) => {
      const response = await apiClient.POST(
        '/api/v1/profiles/{profileUserId}/gifts',
        {
          params: {
            path: { profileUserId },
            header: { 'Idempotency-Key': input.idempotencyKey },
          },
          body: { giftId: input.giftId },
        },
      );
      return response.data?.data;
    },
  });
}

export function usePublicPresence(id: string) {
  return useQuery({
    queryKey: profileKeys.presence(id),
    queryFn: async () => {
      const response = await apiClient.GET('/api/v1/users/{id}/presence', {
        params: { path: { id } },
      });
      return response.data?.data;
    },
    staleTime: 30_000,
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateProfileDto) => {
      const res = await apiClient.PATCH('/api/v1/users/me', { body: input });
      return res.data?.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: currentUserKey });
    },
  });
}
