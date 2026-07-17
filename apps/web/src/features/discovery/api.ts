import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';

import { apiClient } from '../../shared/api/client';

import type { ApiSchema } from '@litmatch/api-client';

export type DiscoveryCardDto = ApiSchema<'DiscoveryCardDto'>;
export type NearbyCardDto = ApiSchema<'NearbyCardDto'>;
export type Gender = ApiSchema<'PublicProfileDto'>['gender'];

const PAGE_LIMIT = 20;

export interface BrowseFilter {
  gender?: Gender;
  ageMin?: number;
  ageMax?: number;
}

export const discoveryKeys = {
  browse: (filter: BrowseFilter) => ['discovery', 'browse', filter] as const,
  nearby: (filter: BrowseFilter) => ['discovery', 'nearby', filter] as const,
};

/** Duyệt user theo gender/tuổi (docs/services/discovery-service.md § 1-7) — lặp lại nhiều lần,
 * không tạo state ticket/queue nào (khác bộ lọc lúc ghép cặp của Matching). `enabled` mặc định
 * true — trang /discovery TẮT hẳn nhánh không active (mode) để không gọi cả 2 API song song
 * (nearby luôn 403 khi chưa bật `nearbyVisible`, gọi mà không dùng chỉ tổ tốn request/gây lỗi
 * console giả — phát hiện qua verify thật bằng browser thật). */
export function useBrowse(
  filter: BrowseFilter,
  options?: { enabled?: boolean },
) {
  return useInfiniteQuery({
    queryKey: discoveryKeys.browse(filter),
    queryFn: async ({ pageParam }) => {
      const res = await apiClient.GET('/api/v1/discovery/browse', {
        params: {
          query: { ...filter, limit: PAGE_LIMIT, cursor: pageParam },
        },
      });
      return res.data?.data;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage?.nextCursor ?? undefined,
    enabled: options?.enabled ?? true,
  });
}

/** Nearby (docs/services/discovery-service.md § 8) — chỉ thấy nhau khi CẢ HAI đã bật `nearbyVisible`. */
export function useNearby(
  filter: BrowseFilter,
  options?: { enabled?: boolean },
) {
  return useInfiniteQuery({
    queryKey: discoveryKeys.nearby(filter),
    queryFn: async ({ pageParam }) => {
      const res = await apiClient.GET('/api/v1/discovery/nearby', {
        params: {
          query: { ...filter, limit: PAGE_LIMIT, cursor: pageParam },
        },
      });
      return res.data?.data;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage?.nextCursor ?? undefined,
    enabled: options?.enabled ?? true,
  });
}

export function useSetNearbyVisible() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (visible: boolean) => {
      await apiClient.PUT('/api/v1/discovery/nearby/visible', {
        body: { visible },
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['discovery'] });
    },
  });
}

/** Server tự quantize ~500m — client gửi toạ độ thật đúng 1 lần lúc bật Nearby, không lưu lại. */
export function useSetLocation() {
  return useMutation({
    mutationFn: async (input: { lat: number; lon: number }) => {
      await apiClient.PUT('/api/v1/discovery/nearby/location', {
        body: input,
      });
    },
  });
}
