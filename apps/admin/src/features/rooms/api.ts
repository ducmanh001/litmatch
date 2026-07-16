import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '../../shared/api/client';

import type { ApiSchema } from '@litmatch/api-client';

export type PartyRoomDto = ApiSchema<'PartyRoomDto'>;
export type AdminRoomDto = ApiSchema<'AdminRoomDto'>;

const PAGE_SIZE = 20;

export const roomsKeys = {
  all: ['party', 'rooms'] as const,
  admin: ['admin', 'rooms'] as const,
};

/**
 * `GET /party/rooms` vốn là endpoint public (user-facing), không có prefix `/admin` — nhưng chỉ
 * trả phòng `status=Active`, không lộ dữ liệu nhạy cảm hơn màn Party Room thường của user, nên
 * dùng lại được cho trang admin (docs/12 § 12.7 chỉ cấm TỰ THÊM endpoint mới, không cấm đọc
 * endpoint public có sẵn). Không có route admin "force-close" — xem docs/07-roadmap.md backlog.
 */
export function useLiveRooms() {
  return useQuery({
    queryKey: roomsKeys.all,
    queryFn: async () => {
      const res = await apiClient.GET('/api/v1/party/rooms', {
        params: { query: { limit: PAGE_SIZE } },
      });
      return res.data;
    },
    staleTime: 5000,
  });
}

export function useAdminRooms() {
  return useQuery({
    queryKey: roomsKeys.admin,
    queryFn: async () => {
      const response = await apiClient.GET('/api/v1/admin/rooms', {
        params: { query: { limit: PAGE_SIZE } },
      });
      return response.data?.data;
    },
    staleTime: 5000,
  });
}

export function useCloseRoom() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const response = await apiClient.POST('/api/v1/admin/rooms/{id}/close', {
        params: { path: { id } },
      });
      return response.data?.data;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: roomsKeys.admin }),
        queryClient.invalidateQueries({ queryKey: roomsKeys.all }),
      ]);
    },
  });
}
