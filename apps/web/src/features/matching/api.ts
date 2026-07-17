import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '../../shared/api/client';

import type { JoinQueueForm } from './join-queue-schema';
import type { ApiSchema } from '@litmatch/api-client';

export type TicketDto = ApiSchema<'TicketDto'>;

export const matchingKeys = {
  all: ['matching'] as const,
  current: ['matching', 'ticket', 'current'] as const,
  ticket: (id: string) => ['matching', 'ticket', id] as const,
};

/** Trạng thái còn "sống" — poll tiếp; `matched`/`expired`/`cancelled`/`confirmed` là chốt/chuyển màn. */
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
        body: input.body,
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
      isPollingStatus(query.state.data?.status) ? 3000 : false,
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
