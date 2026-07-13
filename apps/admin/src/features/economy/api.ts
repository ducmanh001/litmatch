import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '../../shared/api/client';

import type { ApiSchema } from '@litmatch/api-client';

export type AdminWalletDto = ApiSchema<'AdminWalletDto'>;
export type AdminTransactionDto = ApiSchema<'AdminTransactionDto'>;

export const economyKeys = {
  wallet: (userId: string) => ['admin', 'economy', 'wallet', userId] as const,
  transactions: (userId: string) =>
    ['admin', 'economy', 'transactions', userId] as const,
};

export function useAdminWallet(userId: string | null) {
  return useQuery({
    queryKey: economyKeys.wallet(userId ?? 'none'),
    queryFn: async () => {
      if (userId === null) {
        throw new Error(
          'useAdminWallet: userId null — enabled phải chặn trước',
        );
      }
      const res = await apiClient.GET('/api/v1/admin/economy/wallet/{userId}', {
        params: { path: { userId } },
      });
      return res.data?.data;
    },
    enabled: userId !== null,
  });
}

export function useAdminTransactions(userId: string | null) {
  return useQuery({
    queryKey: economyKeys.transactions(userId ?? 'none'),
    queryFn: async () => {
      if (userId === null) {
        throw new Error(
          'useAdminTransactions: userId null — enabled phải chặn trước',
        );
      }
      const res = await apiClient.GET(
        '/api/v1/admin/economy/users/{userId}/transactions',
        { params: { path: { userId }, query: { limit: 20 } } },
      );
      return res.data?.data;
    },
    enabled: userId !== null,
  });
}

export function useRefundTransaction(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { transactionId: string; reason: string }) => {
      const res = await apiClient.POST(
        '/api/v1/admin/economy/transactions/{id}/refund',
        {
          params: { path: { id: input.transactionId } },
          body: { reason: input.reason },
        },
      );
      return res.data?.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: economyKeys.wallet(userId) });
      queryClient.invalidateQueries({
        queryKey: economyKeys.transactions(userId),
      });
    },
  });
}
