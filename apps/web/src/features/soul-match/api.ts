import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { apiClient } from '../../shared/api/client';

import type { ApiSchema } from '@litmatch/api-client';

export type SoulSessionViewDto = ApiSchema<'SoulSessionViewDto'>;
export type SoulMessageDto = ApiSchema<'SoulMessageDto'>;
export type SoulVerdict = ApiSchema<'RateSessionDto'>['verdict'];

const MESSAGES_PAGE_LIMIT = 30;

export const soulMatchKeys = {
  session: (id: string) => ['soul-match', 'session', id] as const,
  messages: (id: string) => ['soul-match', 'messages', id] as const,
  partner: (id: string) => ['soul-match', 'partner', id] as const,
};

/** Dừng poll khi phòng đã đóng (chốt/terminal) — không còn gì để refetch thêm. */
export function isOpenPhase(
  phase: SoulSessionViewDto['phase'] | undefined,
): boolean {
  return phase !== undefined && phase !== 'closed';
}

export function useSoulSession(sessionId: string) {
  return useQuery({
    queryKey: soulMatchKeys.session(sessionId),
    queryFn: async () => {
      const res = await apiClient.GET('/api/v1/soul-match/sessions/{id}', {
        params: { path: { id: sessionId } },
      });
      return res.data?.data;
    },
    refetchInterval: (query) =>
      isOpenPhase(query.state.data?.phase) ? 5000 : false,
  });
}

export function useSoulMessages(sessionId: string) {
  return useInfiniteQuery({
    queryKey: soulMatchKeys.messages(sessionId),
    queryFn: async ({ pageParam }) => {
      const res = await apiClient.GET(
        '/api/v1/soul-match/sessions/{id}/messages',
        {
          params: {
            path: { id: sessionId },
            query: { limit: MESSAGES_PAGE_LIMIT, cursor: pageParam },
          },
        },
      );
      return res.data?.data;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage?.meta.nextCursor ?? undefined,
    // Realtime là best-effort — poll cứng làm fallback thật khi socket rớt/không có
    // (docs/12 §12.8), không chỉ dựa vào invalidate từ soul.message. Component chỉ mount
    // hook này khi phase !== 'closed' (soul-chat-phase-view.tsx), nên không cần tự tắt ở đây.
    refetchInterval: 3000,
  });
}

export function useSendSoulMessage(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { content: string; idempotencyKey: string }) => {
      const res = await apiClient.POST(
        '/api/v1/soul-match/sessions/{id}/messages',
        {
          params: {
            path: { id: sessionId },
            header: { 'Idempotency-Key': input.idempotencyKey },
          },
          body: { content: input.content },
        },
      );
      return res.data?.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: soulMatchKeys.messages(sessionId),
      });
      void queryClient.invalidateQueries({
        queryKey: soulMatchKeys.session(sessionId),
      });
    },
  });
}

export function useRateSession(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (verdict: SoulVerdict) => {
      const res = await apiClient.POST(
        '/api/v1/soul-match/sessions/{id}/rating',
        {
          params: { path: { id: sessionId } },
          body: { verdict },
        },
      );
      return res.data?.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: soulMatchKeys.session(sessionId),
      });
    },
  });
}

export function useSoulPartner(sessionId: string, enabled: boolean) {
  return useQuery({
    queryKey: soulMatchKeys.partner(sessionId),
    queryFn: async () => {
      const res = await apiClient.GET(
        '/api/v1/soul-match/sessions/{id}/partner',
        { params: { path: { id: sessionId } } },
      );
      return res.data?.data;
    },
    // Chỉ gọi khi đã matched — tránh gọi 1 request chắc chắn 403 (server chỉ mở khi matched).
    enabled,
  });
}
