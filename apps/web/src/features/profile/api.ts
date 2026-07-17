import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '../../shared/api/client';
import { currentUserKey } from '../../shared/auth/use-current-user';

import type { ApiSchema } from '@litmatch/api-client';

export type UpdateProfileDto = ApiSchema<'UpdateProfileDto'>;
export type PublicProfileDto = ApiSchema<'PublicProfileDto'>;

export const profileKeys = {
  public: (id: string) => ['profile', 'public', id] as const,
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
