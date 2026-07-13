import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '../../shared/api/client';

import type { ApiSchema } from '@litmatch/api-client';

export type AdminUserDto = ApiSchema<'AdminUserDto'>;

export interface UsersListFilter {
  status?: AdminUserDto['status'];
  role?: AdminUserDto['role'];
  nickname?: string;
}

export const usersKeys = {
  all: ['admin', 'users'] as const,
  list: (filter: UsersListFilter, offset: number) =>
    ['admin', 'users', filter, offset] as const,
};

const PAGE_SIZE = 20;

export function useUsersList(filter: UsersListFilter, offset: number) {
  return useQuery({
    queryKey: usersKeys.list(filter, offset),
    queryFn: async () => {
      const res = await apiClient.GET('/api/v1/admin/users', {
        params: {
          query: {
            status: filter.status,
            role: filter.role,
            nickname: filter.nickname === '' ? undefined : filter.nickname,
            limit: PAGE_SIZE,
            offset,
          },
        },
      });
      return res.data?.data;
    },
    // Danh sách staff xem — không cần realtime, refetch khi filter/offset đổi là đủ.
    staleTime: 5000,
  });
}

export function useBanUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiClient.POST('/api/v1/admin/users/{id}/ban', {
        params: { path: { id: userId } },
      });
      return res.data?.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: usersKeys.all }),
  });
}

export function useUnbanUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiClient.POST('/api/v1/admin/users/{id}/unban', {
        params: { path: { id: userId } },
      });
      return res.data?.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: usersKeys.all }),
  });
}
