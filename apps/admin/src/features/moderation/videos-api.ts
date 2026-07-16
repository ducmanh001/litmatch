import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '../../shared/api/client';

import type { ApiSchema } from '@litmatch/api-client';

export type AdminVideoDto = ApiSchema<'AdminVideoDto'>;

const PAGE_SIZE = 20;

export const pendingVideosKeys = {
  all: ['admin', 'videos'] as const,
  pending: ['admin', 'videos', 'pending'] as const,
  published: ['admin', 'videos', 'published'] as const,
};

/**
 * Chỉ trả video `pending_review` (VIDEO_MODERATION_MODE=pre) — không có endpoint list video đã
 * publish, nên trang chỉ hiện đúng 1 trang đầu (không "tải thêm") + ghi chú khi còn video khác.
 */
export function usePendingVideos() {
  return useQuery({
    queryKey: pendingVideosKeys.pending,
    queryFn: async () => {
      const res = await apiClient.GET('/api/v1/admin/videos/pending', {
        params: { query: { limit: PAGE_SIZE } },
      });
      return res.data?.data;
    },
    staleTime: 5000,
  });
}

export function usePublishedVideos() {
  return useQuery({
    queryKey: pendingVideosKeys.published,
    queryFn: async () => {
      const response = await apiClient.GET('/api/v1/admin/videos/published', {
        params: { query: { limit: PAGE_SIZE } },
      });
      return response.data?.data;
    },
    staleTime: 5000,
  });
}

export function useApproveVideo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.POST('/api/v1/admin/videos/{id}/approve', {
        params: { path: { id } },
      });
      return res.data?.data;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: pendingVideosKeys.all }),
  });
}

export function useRejectVideo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.POST('/api/v1/admin/videos/{id}/reject', {
        params: { path: { id } },
      });
      return res.data?.data;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: pendingVideosKeys.all }),
  });
}

export function useRemoveVideo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const response = await apiClient.POST(
        '/api/v1/admin/videos/{id}/remove',
        {
          params: { path: { id } },
        },
      );
      return response.data?.data;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: pendingVideosKeys.all }),
  });
}
