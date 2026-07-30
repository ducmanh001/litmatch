import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '../../shared/api/client';

import type { ApiSchema } from '@litmatch/api-client';

export type WalletDto = ApiSchema<'WalletDto'>;
export type IapProductDto = ApiSchema<'IapProductDto'>;
export type PayosPackageDto = ApiSchema<'PayosPackageDto'>;

export const walletKeys = {
  wallet: ['wallet', 'me'] as const,
  iapProducts: ['wallet', 'iap-products'] as const,
  payosPackages: ['wallet', 'payos-packages'] as const,
  payosOrder: (orderId: string) => ['wallet', 'payos-order', orderId] as const,
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

export function usePayosPackages(enabled = true) {
  return useQuery({
    queryKey: walletKeys.payosPackages,
    queryFn: async () => {
      const res = await apiClient.GET('/api/v1/economy/payos/packages');
      return res.data?.data;
    },
    staleTime: Infinity,
    enabled,
  });
}

export function usePayosOrder(orderId: string | null) {
  return useQuery({
    queryKey: walletKeys.payosOrder(orderId ?? ''),
    queryFn: async () => {
      if (orderId === null) return undefined;
      const res = await apiClient.GET(
        '/api/v1/economy/payos/orders/{orderId}',
        { params: { path: { orderId } } },
      );
      return res.data?.data;
    },
    enabled: orderId !== null,
  });
}

export function useCreatePayosOrder() {
  return useMutation({
    mutationFn: async (input: {
      packageId: string;
      idempotencyKey: string;
    }) => {
      const res = await apiClient.POST('/api/v1/economy/payos/orders', {
        params: {
          header: { 'Idempotency-Key': input.idempotencyKey },
        },
        body: { packageId: input.packageId },
      });
      return res.data?.data;
    },
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
