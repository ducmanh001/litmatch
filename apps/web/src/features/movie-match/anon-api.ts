import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { apiClient } from '../../shared/api/client';

import type { ApiSchema } from '@litmatch/api-client';

export type MovieAnonStateDto = ApiSchema<'MovieAnonStateDto'>;
export type MovieAnonRating = ApiSchema<'RateMovieMatchDto'>['rating'];
export type MovieMessageDto = ApiSchema<'MovieMessageDto'>;

const MESSAGES_PAGE_LIMIT = 30;

export const movieAnonKeys = {
  current: ['movie-match', 'anon', 'current'] as const,
  messages: (sessionId: string) =>
    ['movie-match', 'anon', 'messages', sessionId] as const,
};

function shouldPoll(state: MovieAnonStateDto['state'] | undefined): boolean {
  return state === 'queued' || state === 'watching' || state === 'rating';
}

/** REST state là nguồn sự thật; poll phục hồi khi tab bỏ lỡ thay đổi của participant kia. */
export function useCurrentMovieAnon() {
  return useQuery({
    queryKey: movieAnonKeys.current,
    queryFn: async () => {
      const response = await apiClient.GET('/api/v1/movie-match/anon/current');
      return response.data?.data;
    },
    refetchInterval: (query) =>
      shouldPoll(query.state.data?.state) ? 2000 : false,
  });
}

function useAnonStateMutation<TInput>(
  mutationFn: (input: TInput) => Promise<MovieAnonStateDto | undefined>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (state) => {
      if (state) queryClient.setQueryData(movieAnonKeys.current, state);
      void queryClient.invalidateQueries({ queryKey: movieAnonKeys.current });
    },
  });
}

export function useJoinMovieAnonQueue() {
  return useAnonStateMutation(async () => {
    const response = await apiClient.POST('/api/v1/movie-match/anon/queue');
    return response.data?.data;
  });
}

export function useDismissMovieAnon() {
  return useAnonStateMutation(async () => {
    const response = await apiClient.DELETE('/api/v1/movie-match/anon/current');
    return response.data?.data;
  });
}

export function useUpdateMovieAnonState(sessionId: string) {
  return useAnonStateMutation(
    async (input: { positionSeconds: number; isPlaying: boolean }) => {
      const response = await apiClient.PATCH(
        '/api/v1/movie-match/anon/sessions/{id}/state',
        { params: { path: { id: sessionId } }, body: input },
      );
      return response.data?.data;
    },
  );
}

export function useFinishMovieAnonWatch(sessionId: string) {
  return useAnonStateMutation(async () => {
    const response = await apiClient.POST(
      '/api/v1/movie-match/anon/sessions/{id}/finish',
      { params: { path: { id: sessionId } } },
    );
    return response.data?.data;
  });
}

export function useRateMovieAnon(sessionId: string) {
  return useAnonStateMutation(async (rating: MovieAnonRating) => {
    const response = await apiClient.POST(
      '/api/v1/movie-match/anon/sessions/{id}/rating',
      { params: { path: { id: sessionId } }, body: { rating } },
    );
    return response.data?.data;
  });
}

/** Chat trong phiên — poll là fallback REST thật (docs/12 §12.8), không có event riêng. */
export function useMovieAnonMessages(sessionId: string, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: movieAnonKeys.messages(sessionId),
    queryFn: async ({ pageParam }) => {
      const response = await apiClient.GET(
        '/api/v1/movie-match/anon/sessions/{id}/messages',
        {
          params: {
            path: { id: sessionId },
            query: { limit: MESSAGES_PAGE_LIMIT, cursor: pageParam },
          },
        },
      );
      return response.data?.data;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage?.meta.nextCursor ?? undefined,
    refetchInterval: 3000,
    enabled,
  });
}

export function useSendMovieAnonMessage(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { content: string; idempotencyKey: string }) => {
      const response = await apiClient.POST(
        '/api/v1/movie-match/anon/sessions/{id}/messages',
        {
          params: {
            path: { id: sessionId },
            header: { 'Idempotency-Key': input.idempotencyKey },
          },
          body: { content: input.content },
        },
      );
      return response.data?.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: movieAnonKeys.messages(sessionId),
      });
    },
  });
}

export type MovieAnonReaction = ApiSchema<'ReactMovieDto'>['emoji'];

/** Reaction realtime-only — server publish cho cả hai, client tự vẽ hiệu ứng khi nhận event. */
export function useSendMovieAnonReaction(sessionId: string) {
  return useMutation({
    mutationFn: async (emoji: MovieAnonReaction) => {
      await apiClient.POST('/api/v1/movie-match/anon/sessions/{id}/reactions', {
        params: { path: { id: sessionId } },
        body: { emoji },
      });
    },
  });
}
