import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '../../shared/api/client';

import type { ApiSchema } from '@litmatch/api-client';

export type CallDto = ApiSchema<'CallDto'>;
export type JoinCallDto = ApiSchema<'JoinCallDto'>;

export const voiceMatchKeys = {
  call: (id: string) => ['voice-match', 'call', id] as const,
};

/** Poll tiếp khi call chưa kết thúc — status 'ended' là chốt/terminal. */
export function isActiveCallStatus(
  status: CallDto['status'] | undefined,
): boolean {
  return status !== undefined && status !== 'ended';
}

export function useJoinCall(matchSessionId: string) {
  return useMutation({
    mutationFn: async () => {
      const res = await apiClient.POST(
        '/api/v1/calling/match-sessions/{matchSessionId}/join',
        { params: { path: { matchSessionId } } },
      );
      return res.data?.data;
    },
  });
}

export function useCall(callId: string | null) {
  return useQuery({
    queryKey: voiceMatchKeys.call(callId ?? 'none'),
    queryFn: async () => {
      if (callId === null) {
        throw new Error('useCall: callId null — enabled phải chặn trước');
      }
      const res = await apiClient.GET('/api/v1/calling/calls/{id}', {
        params: { path: { id: callId } },
      });
      return res.data?.data;
    },
    enabled: callId !== null,
    refetchInterval: (query) =>
      isActiveCallStatus(query.state.data?.status) ? 4000 : false,
  });
}

export function useEndCall(callId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiClient.POST('/api/v1/calling/calls/{id}/end', {
        params: { path: { id: callId } },
      });
      return res.data?.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: voiceMatchKeys.call(callId),
      });
    },
  });
}
