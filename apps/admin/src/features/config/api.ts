import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '../../shared/api/client';

import type { ApiSchema } from '@litmatch/api-client';

export type AdminEconomyCatalogDto = ApiSchema<'AdminEconomyCatalogDto'>;
export type AdminIapProductDto = ApiSchema<'AdminIapProductDto'>;
export type AdminVipPlanDto = ApiSchema<'AdminVipPlanDto'>;
export type BroadcastAudience =
  ApiSchema<'BroadcastNotificationDto'>['audience'];

export const configKeys = {
  catalog: ['admin', 'config', 'economy-catalog'] as const,
};

export function useEconomyCatalog() {
  return useQuery({
    queryKey: configKeys.catalog,
    queryFn: async () => {
      const response = await apiClient.GET(
        '/api/v1/admin/config/economy-catalog',
      );
      return response.data?.data;
    },
  });
}

export function useSetIapProductActive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { productId: string; active: boolean }) => {
      const response = await apiClient.PATCH(
        '/api/v1/admin/config/iap-products/{productId}',
        {
          params: { path: { productId: input.productId } },
          body: { active: input.active },
        },
      );
      return response.data?.data;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: configKeys.catalog }),
  });
}

export function useSetVipPlanActive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; active: boolean }) => {
      const response = await apiClient.PATCH(
        '/api/v1/admin/config/vip-plans/{id}',
        {
          params: { path: { id: input.id } },
          body: { active: input.active },
        },
      );
      return response.data?.data;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: configKeys.catalog }),
  });
}

export function useBroadcastNotification() {
  return useMutation({
    mutationFn: async (input: {
      title: string;
      body: string;
      audience: BroadcastAudience;
    }) => {
      const response = await apiClient.POST(
        '/api/v1/admin/notifications/broadcast',
        {
          body: input,
        },
      );
      return response.data?.data;
    },
  });
}
