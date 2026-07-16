import { useQuery } from '@tanstack/react-query';

import { apiClient } from '../../shared/api/client';

import type { ApiSchema } from '@litmatch/api-client';

export type AdminDashboardDto = ApiSchema<'AdminDashboardDto'>;

export const dashboardKeys = {
  summary: ['admin', 'dashboard'] as const,
};

export function useAdminDashboard() {
  return useQuery({
    queryKey: dashboardKeys.summary,
    queryFn: async () => {
      const response = await apiClient.GET('/api/v1/admin/dashboard');
      return response.data?.data;
    },
    staleTime: 30_000,
  });
}
