import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '../../shared/api/client';

import type { ApiSchema } from '@litmatch/api-client';

export type AdminSupportTicketDto = ApiSchema<'AdminSupportTicketDto'>;

export const adminSupportKeys = {
  all: ['admin', 'support', 'tickets'] as const,
  list: (status?: AdminSupportTicketDto['status']) =>
    ['admin', 'support', 'tickets', status ?? 'all'] as const,
};

export function useAdminSupportTickets(
  status?: AdminSupportTicketDto['status'],
) {
  return useQuery({
    queryKey: adminSupportKeys.list(status),
    queryFn: async () => {
      const response = await apiClient.GET('/api/v1/admin/support/tickets', {
        params: { query: { limit: 20, status } },
      });
      return response.data?.data;
    },
  });
}

export function useUpdateSupportTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      status: AdminSupportTicketDto['status'];
      staffResponse?: string;
    }) => {
      const response = await apiClient.PATCH(
        '/api/v1/admin/support/tickets/{id}',
        {
          params: { path: { id: input.id } },
          body: { status: input.status, staffResponse: input.staffResponse },
        },
      );
      return response.data?.data;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: adminSupportKeys.all }),
  });
}
