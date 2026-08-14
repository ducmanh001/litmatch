import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '../../shared/api/client';

import type { JoinQueueForm } from './join-queue-schema';
import type { ApiSchema } from '@litmatch/api-client';

export type TicketDto = ApiSchema<'TicketDto'>;

export const MATCHING_TICKET_REFETCH_INTERVAL_MS = 10_000;

export const matchingKeys = {
  all: ['matching'] as const,
  current: ['matching', 'ticket', 'current'] as const,
  ticket: (id: string) => ['matching', 'ticket', id] as const,
};

type JoinQueueRequest = Omit<ApiSchema<'JoinQueueDto'>, 'useDiamond'> & {
  useDiamond?: true;
};

/**
 * Giữ tương thích với core-api chưa có paid matching: request miễn phí không
 * gửi `useDiamond: false` vì ValidationPipe của runtime cũ coi đây là field lạ.
 * Khi user thực sự mua thêm lượt, vẫn phải truyền rõ `useDiamond: true`.
 */
export function toJoinQueueRequest(body: JoinQueueForm): JoinQueueRequest {
  const { useDiamond, ...request } = body;
  return useDiamond ? { ...request, useDiamond: true } : request;
}

/** Trạng thái còn chờ ghép. Session được server xác nhận ngay khi có cặp, nên `confirmed`
 * là điểm chuyển màn; giữ `matched` để client cũ vẫn tự hoàn tất được session legacy. */
export function isPollingStatus(
  status: TicketDto['status'] | undefined,
): boolean {
  return status === 'queued' || status === 'matched';
}

export function useJoinQueue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      body: JoinQueueForm;
      idempotencyKey: string;
    }) => {
      const res = await apiClient.POST('/api/v1/matching/tickets', {
        params: { header: { 'Idempotency-Key': input.idempotencyKey } },
        // openapi-typescript treats defaulted fields as required, while the
        // server schema only requires matchType. The mapper above preserves
        // that server contract and omits the legacy-incompatible false field.
        body: toJoinQueueRequest(input.body) as ApiSchema<'JoinQueueDto'>,
      });
      return res.data?.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: matchingKeys.current });
    },
  });
}

/** Nguồn sự thật để phục hồi ticket queued/matched khi reload hoặc quay lại trang Matching. */
export function useCurrentTicket() {
  return useQuery({
    queryKey: matchingKeys.current,
    queryFn: async () => {
      const res = await apiClient.GET('/api/v1/matching/tickets/current');
      return res.data?.data;
    },
  });
}

export function useTicket(ticketId: string | null) {
  return useQuery({
    queryKey: matchingKeys.ticket(ticketId ?? 'none'),
    queryFn: async () => {
      if (ticketId === null) {
        throw new Error('useTicket: ticketId null — enabled phải chặn trước');
      }
      const res = await apiClient.GET('/api/v1/matching/tickets/{id}', {
        params: { path: { id: ticketId } },
      });
      return res.data?.data;
    },
    enabled: ticketId !== null,
    // Poll ngắn khi còn đang chờ ghép/chờ confirm — socket best-effort, poll là fallback thật.
    refetchInterval: (query) =>
      isPollingStatus(query.state.data?.status)
        ? MATCHING_TICKET_REFETCH_INTERVAL_MS
        : false,
  });
}

export function useCancelTicket(ticketId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiClient.DELETE('/api/v1/matching/tickets/{id}', {
        params: { path: { id: ticketId } },
      });
      return res.data?.data;
    },
    onSuccess: () => {
      // Xóa snapshot để màn Matching không dùng lại ticket queued cũ trong lúc
      // request current đang được refetch sau khi hủy.
      queryClient.setQueryData(matchingKeys.current, { ticket: null });
      void queryClient.invalidateQueries({
        queryKey: matchingKeys.ticket(ticketId),
      });
      void queryClient.invalidateQueries({ queryKey: matchingKeys.current });
    },
  });
}

export function useConfirmTicket(ticketId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiClient.POST(
        '/api/v1/matching/tickets/{id}/confirm',
        { params: { path: { id: ticketId } } },
      );
      return res.data?.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: matchingKeys.ticket(ticketId),
      });
      void queryClient.invalidateQueries({ queryKey: matchingKeys.current });
    },
  });
}

export function useSpeedup(ticketId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (idempotencyKey: string) => {
      const res = await apiClient.POST(
        '/api/v1/matching/tickets/{id}/speedup',
        {
          params: {
            path: { id: ticketId },
            header: { 'Idempotency-Key': idempotencyKey },
          },
        },
      );
      return res.data?.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: matchingKeys.ticket(ticketId),
      });
    },
  });
}
