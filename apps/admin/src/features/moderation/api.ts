import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '../../shared/api/client';

import type { ApiSchema } from '@litmatch/api-client';

export type AdminReportDto = ApiSchema<'AdminReportDto'>;

export const reportsKeys = {
  all: ['admin', 'reports'] as const,
  list: (status: AdminReportDto['status'] | undefined, offset: number) =>
    ['admin', 'reports', status ?? 'all', offset] as const,
};

const PAGE_SIZE = 20;

export function useReportsList(
  status: AdminReportDto['status'] | undefined,
  offset: number,
) {
  return useQuery({
    queryKey: reportsKeys.list(status, offset),
    queryFn: async () => {
      const res = await apiClient.GET('/api/v1/admin/reports', {
        params: { query: { status, limit: PAGE_SIZE, offset } },
      });
      return res.data?.data;
    },
    staleTime: 5000,
  });
}

export function useResolveReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (reportId: string) => {
      const res = await apiClient.POST('/api/v1/admin/reports/{id}/resolve', {
        params: { path: { id: reportId } },
      });
      return res.data?.data;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: reportsKeys.all }),
  });
}

export function useDismissReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (reportId: string) => {
      const res = await apiClient.POST('/api/v1/admin/reports/{id}/dismiss', {
        params: { path: { id: reportId } },
      });
      return res.data?.data;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: reportsKeys.all }),
  });
}
