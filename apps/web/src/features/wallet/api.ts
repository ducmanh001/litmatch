import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '../../shared/api/client';

import type { ApiSchema } from '@litmatch/api-client';

export type WalletDto = ApiSchema<'WalletDto'>;
export type IapProductDto = ApiSchema<'IapProductDto'>;
export type VipPlanDto = ApiSchema<'VipPlanDto'>;

export const walletKeys = {
  wallet: ['wallet', 'me'] as const,
  iapProducts: ['wallet', 'iap-products'] as const,
  vipPlans: ['wallet', 'vip-plans'] as const,
};

export function useWallet() {
  return useQuery({
    queryKey: walletKeys.wallet,
    queryFn: async () => {
      const res = await apiClient.GET('/api/v1/economy/wallet');
      return res.data?.data;
    },
  });
}

export function useIapProducts() {
  return useQuery({
    queryKey: walletKeys.iapProducts,
    queryFn: async () => {
      const res = await apiClient.GET('/api/v1/economy/iap/products');
      return res.data?.data;
    },
    // Catalog gói diamond gần như không đổi trong phiên — không cần refetch liên tục.
    staleTime: Infinity,
  });
}

export function useVipPlans() {
  return useQuery({
    queryKey: walletKeys.vipPlans,
    queryFn: async () => {
      const res = await apiClient.GET('/api/v1/economy/vip/plans');
      return res.data?.data;
    },
    staleTime: Infinity,
  });
}

export function usePurchaseVip() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { planId: string; idempotencyKey: string }) => {
      const res = await apiClient.POST('/api/v1/economy/vip/purchase', {
        params: {
          header: { 'Idempotency-Key': input.idempotencyKey },
        },
        body: { planId: input.planId },
      });
      return res.data?.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: walletKeys.wallet });
    },
  });
}

export function useVerifyIap() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      provider: IapProductDto['provider'];
      productId: string;
      devTransactionId: string;
    }) => {
      const res = await apiClient.POST('/api/v1/economy/iap/verify', {
        body: {
          provider: input.provider,
          productId: input.productId,
          payload: { devTransactionId: input.devTransactionId },
        },
      });
      return res.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: walletKeys.wallet });
    },
  });
}
