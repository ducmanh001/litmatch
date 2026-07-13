import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '../../shared/api/client';

import type { ApiSchema } from '@litmatch/api-client';

export type AdminGiftDto = ApiSchema<'AdminGiftDto'>;
export type CreateGiftInput = ApiSchema<'CreateGiftDto'>;
export type UpdateGiftInput = ApiSchema<'UpdateGiftDto'>;

export const giftsKeys = {
  all: ['admin', 'gifts'] as const,
};

export function useGiftsList() {
  return useQuery({
    queryKey: giftsKeys.all,
    queryFn: async () => {
      const res = await apiClient.GET('/api/v1/admin/gifts');
      return res.data?.data;
    },
    staleTime: 5000,
  });
}

export function useCreateGift() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateGiftInput) => {
      const res = await apiClient.POST('/api/v1/admin/gifts', { body: input });
      return res.data?.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: giftsKeys.all }),
  });
}

export function useUpdateGift() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; body: UpdateGiftInput }) => {
      const res = await apiClient.PATCH('/api/v1/admin/gifts/{id}', {
        params: { path: { id: input.id } },
        body: input.body,
      });
      return res.data?.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: giftsKeys.all }),
  });
}
