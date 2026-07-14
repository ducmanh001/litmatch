import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '../../shared/api/client';

import type { ApiSchema } from '@litmatch/api-client';

export type MovieSessionDto = ApiSchema<'MovieSessionDto'>;

export const movieMatchKeys = {
  session: (sessionId: string) =>
    ['movie-match', 'session', sessionId] as const,
};

/** Còn "sống" — poll tiếp; `ended` là chốt, không còn gì để refetch thêm. */
export function isActiveSession(
  status: MovieSessionDto['status'] | undefined,
): boolean {
  return status === 'active';
}

export function useCreateSession() {
  return useMutation({
    mutationFn: async (input: { friendUserId: string; videoUrl: string }) => {
      const res = await apiClient.POST('/api/v1/movie-match/sessions', {
        body: input,
      });
      return res.data?.data;
    },
  });
}

/** Poll fallback y như mọi feature khác — realtime chỉ là gợi ý refetch sớm (docs/12 §12.8). */
export function useSession(sessionId: string) {
  return useQuery({
    queryKey: movieMatchKeys.session(sessionId),
    queryFn: async () => {
      const res = await apiClient.GET('/api/v1/movie-match/sessions/{id}', {
        params: { path: { id: sessionId } },
      });
      return res.data?.data;
    },
    refetchInterval: (query) =>
      isActiveSession(query.state.data?.status) ? 4000 : false,
  });
}

export function useUpdateState(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      positionSeconds: number;
      isPlaying: boolean;
    }) => {
      const res = await apiClient.PATCH(
        '/api/v1/movie-match/sessions/{id}/state',
        {
          params: { path: { id: sessionId } },
          body: input,
        },
      );
      return res.data?.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: movieMatchKeys.session(sessionId),
      });
    },
  });
}

export function useEndSession(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiClient.POST(
        '/api/v1/movie-match/sessions/{id}/end',
        { params: { path: { id: sessionId } } },
      );
      return res.data?.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: movieMatchKeys.session(sessionId),
      });
    },
  });
}
