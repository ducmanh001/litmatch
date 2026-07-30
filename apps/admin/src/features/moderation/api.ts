import { isApiError } from '@litmatch/api-client';
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
        params: {
          // OpenAPI hiện generate Integer query thành Object; runtime contract vẫn là number.
          query: {
            status,
            limit: PAGE_SIZE as unknown as Record<string, never>,
            offset: offset as unknown as Record<string, never>,
          },
        },
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

export type BulkReportAction = 'resolve' | 'dismiss';

export interface BulkReportResult {
  succeededIds: string[];
  failures: BulkReportFailure[];
}

export interface BulkReportFailure {
  reportId: string;
  code: string;
  message: string;
  traceId: string;
}

/**
 * Backend chỉ expose action theo từng report; chạy tuần tự để mỗi case vẫn có transaction +
 * audit log riêng và để UI báo được partial failure thay vì giả vờ toàn bộ batch atomic.
 */
export function useBulkReportAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      reportIds,
      action,
    }: {
      reportIds: string[];
      action: BulkReportAction;
    }): Promise<BulkReportResult> => {
      const result: BulkReportResult = { succeededIds: [], failures: [] };
      for (const id of reportIds) {
        try {
          await apiClient.POST(
            action === 'resolve'
              ? '/api/v1/admin/reports/{id}/resolve'
              : '/api/v1/admin/reports/{id}/dismiss',
            { params: { path: { id } } },
          );
          result.succeededIds.push(id);
        } catch (error) {
          result.failures.push({
            reportId: id,
            code: isApiError(error) ? error.code : 'UNKNOWN_ERROR',
            message: isApiError(error)
              ? error.message
              : 'Có lỗi không xác định khi cập nhật case.',
            traceId: isApiError(error) ? error.traceId : '',
          });
        }
      }
      return result;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: reportsKeys.all }),
  });
}
