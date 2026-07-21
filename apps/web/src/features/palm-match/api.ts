import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '../../shared/api/client';

import type { ApiSchema } from '@litmatch/api-client';

export type PalmMatchStateDto = ApiSchema<'PalmMatchStateDto'>;
export type PalmMatchRating = ApiSchema<'RatePalmMatchDto'>['rating'];

export const palmMatchKeys = {
  current: ['palm-match', 'current'] as const,
};

function shouldPoll(state: PalmMatchStateDto['state'] | undefined): boolean {
  return state === 'queued' || state === 'active';
}

/** REST state là nguồn sự thật; poll phục hồi khi tab bỏ lỡ thay đổi của participant kia. */
export function useCurrentPalmMatch() {
  return useQuery({
    queryKey: palmMatchKeys.current,
    queryFn: async () => {
      const response = await apiClient.GET('/api/v1/palm-match/current');
      return response.data?.data;
    },
    refetchInterval: (query) =>
      shouldPoll(query.state.data?.state) ? 2000 : false,
  });
}

function usePalmStateMutation<TInput>(
  mutationFn: (input: TInput) => Promise<PalmMatchStateDto | undefined>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (state) => {
      if (state) queryClient.setQueryData(palmMatchKeys.current, state);
      void queryClient.invalidateQueries({ queryKey: palmMatchKeys.current });
    },
  });
}

export function useJoinPalmQueue() {
  return usePalmStateMutation(async () => {
    const response = await apiClient.POST('/api/v1/palm-match/queue');
    return response.data?.data;
  });
}

export function useFlipPalmCard() {
  return usePalmStateMutation(async (sessionId: string) => {
    const response = await apiClient.POST(
      '/api/v1/palm-match/sessions/{id}/flip',
      { params: { path: { id: sessionId } } },
    );
    return response.data?.data;
  });
}

export function useRatePalmMatch() {
  return usePalmStateMutation(
    async (input: { sessionId: string; rating: PalmMatchRating }) => {
      const response = await apiClient.POST(
        '/api/v1/palm-match/sessions/{id}/rating',
        {
          params: { path: { id: input.sessionId } },
          body: { rating: input.rating },
        },
      );
      return response.data?.data;
    },
  );
}

export function useDismissPalmMatch() {
  return usePalmStateMutation(async () => {
    const response = await apiClient.DELETE('/api/v1/palm-match/current');
    return response.data?.data;
  });
}
