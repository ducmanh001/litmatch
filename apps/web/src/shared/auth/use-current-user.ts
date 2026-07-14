'use client';

import { useQuery } from '@tanstack/react-query';

import { apiClient } from '../api/client';
import { useIsAuthenticated } from './use-session';

import type { ApiSchema } from '@litmatch/api-client';

export type MyProfileDto = ApiSchema<'MyProfileDto'>;

/** "Mình là ai" — dùng để so `senderUserId` trong các luồng chat không ẩn danh (Friend chat). */
export const currentUserKey = ['auth', 'me'] as const;

export function useCurrentUser() {
  const isAuthenticated = useIsAuthenticated();
  return useQuery({
    queryKey: currentUserKey,
    queryFn: async () => {
      const res = await apiClient.GET('/api/v1/users/me');
      return res.data?.data;
    },
    enabled: isAuthenticated,
    // Danh tính không đổi trong phiên đăng nhập — Providers đã clear cache lúc logout.
    staleTime: Infinity,
  });
}
