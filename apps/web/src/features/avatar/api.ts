import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '../../shared/api/client';

import type { ApiSchema } from '@litmatch/api-client';

export type AvatarAssetDto = ApiSchema<'AvatarAssetDto'>;
export type AvatarConfigDto = ApiSchema<'AvatarConfigDto'>;
export type AvatarSlot = AvatarAssetDto['slot'];

export const avatarKeys = {
  all: ['avatar'] as const,
  me: ['avatar', 'me'] as const,
  catalog: ['avatar', 'catalog'] as const,
  myItems: ['avatar', 'my-items'] as const,
};

export function useMyAvatar() {
  return useQuery({
    queryKey: avatarKeys.me,
    queryFn: async () => {
      const res = await apiClient.GET('/api/v1/avatar/me');
      return res.data?.data;
    },
  });
}

export function useAvatarCatalog() {
  return useQuery({
    queryKey: avatarKeys.catalog,
    queryFn: async () => {
      const res = await apiClient.GET('/api/v1/avatar/catalog');
      return res.data?.data ?? [];
    },
    // Catalog gần như không đổi trong phiên
    staleTime: 5 * 60 * 1000,
  });
}

export function useMyAvatarItems() {
  return useQuery({
    queryKey: avatarKeys.myItems,
    queryFn: async () => {
      const res = await apiClient.GET('/api/v1/avatar/me/items');
      return res.data?.data ?? [];
    },
  });
}

/** Nhận item free — idempotent phía server (ON CONFLICT DO NOTHING). */
export function useClaimAvatarItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (assetId: string) => {
      await apiClient.POST('/api/v1/avatar/items/{assetId}/claim', {
        params: { path: { assetId } },
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: avatarKeys.myItems });
    },
  });
}

/** Mua item trả phí — trừ diamond qua Economy, bắt buộc Idempotency-Key theo intent. */
export function useBuyAvatarItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { assetId: string; idempotencyKey: string }) => {
      const res = await apiClient.POST('/api/v1/avatar/items/{assetId}/buy', {
        params: {
          path: { assetId: input.assetId },
          header: { 'Idempotency-Key': input.idempotencyKey },
        },
      });
      return res.data?.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: avatarKeys.myItems });
      // Số dư diamond đổi sau khi mua
      void queryClient.invalidateQueries({ queryKey: ['wallet', 'me'] });
    },
  });
}

export function useEquipAvatarItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { slot: AvatarSlot; avatarAssetId: string }) => {
      const res = await apiClient.PUT('/api/v1/avatar/me/equip', {
        body: input,
      });
      return res.data?.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: avatarKeys.me });
    },
  });
}
