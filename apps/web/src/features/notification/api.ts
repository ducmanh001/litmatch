import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { apiClient } from '../../shared/api/client';

import type { ApiSchema } from '@litmatch/api-client';

export type NotificationDto = ApiSchema<'NotificationDto'>;

const NOTIFICATION_PAGE_LIMIT = 20;

/** Badge chuông cần tươi hơn cache mặc định nhưng không cần realtime từng giây. */
const UNREAD_COUNT_REFETCH_MS = 30_000;

export const notificationKeys = {
  all: ['notifications'] as const,
  list: ['notifications', 'list'] as const,
  unreadCount: ['notifications', 'unread-count'] as const,
};

export function useUnreadNotificationCount() {
  return useQuery({
    queryKey: notificationKeys.unreadCount,
    queryFn: async () => {
      const res = await apiClient.GET('/api/v1/notifications/unread-count');
      return res.data?.data;
    },
    refetchInterval: UNREAD_COUNT_REFETCH_MS,
  });
}

/** `enabled` gắn với trạng thái mở panel — không tải list khi người dùng chưa mở chuông. */
export function useNotifications(enabled: boolean) {
  return useInfiniteQuery({
    queryKey: notificationKeys.list,
    queryFn: async ({ pageParam }) => {
      const res = await apiClient.GET('/api/v1/notifications', {
        params: {
          query: { limit: NOTIFICATION_PAGE_LIMIT, cursor: pageParam },
        },
      });
      return res.data?.data;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      (lastPage?.nextCursor as string | null | undefined) ?? undefined,
    enabled,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    // 204 No Content — không có body để đọc
    mutationFn: async (notificationId: string) => {
      await apiClient.POST('/api/v1/notifications/{notificationId}/read', {
        params: { path: { notificationId } },
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}
