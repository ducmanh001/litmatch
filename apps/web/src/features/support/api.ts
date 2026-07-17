import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '../../shared/api/client';

import type { ApiSchema } from '@litmatch/api-client';

export type SupportTicketDto = ApiSchema<'SupportTicketDto'>;
export type SupportTicketCategory =
  ApiSchema<'CreateSupportTicketDto'>['category'];

export const supportKeys = {
  mine: ['support', 'tickets', 'mine'] as const,
};

export function useMySupportTickets() {
  return useQuery({
    queryKey: supportKeys.mine,
    queryFn: async () => {
      const response = await apiClient.GET('/api/v1/support/tickets/me', {
        params: { query: { limit: 20 } },
      });
      return response.data?.data;
    },
  });
}

export function useCreateSupportTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      category: SupportTicketCategory;
      message: string;
      idempotencyKey: string;
    }) => {
      const response = await apiClient.POST('/api/v1/support/tickets', {
        params: { header: { 'Idempotency-Key': input.idempotencyKey } },
        body: { category: input.category, message: input.message },
      });
      return response.data?.data;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: supportKeys.mine }),
  });
}
