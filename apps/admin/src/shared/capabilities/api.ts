import { useQuery } from '@tanstack/react-query';

import { apiClient } from '../api/client';

import type { ApiSchema } from '@litmatch/api-client';

export type CapabilitiesDto = ApiSchema<'CapabilitiesDto'>;
export type CapabilityStateDto = ApiSchema<'CapabilityStateDto'>;

export const capabilityKeys = {
  runtime: ['capabilities', 'runtime'] as const,
};

const CAPABILITY_REFRESH_MS = 30_000;

export function isCapabilityUsable(
  capability: CapabilityStateDto | undefined,
): boolean {
  return capability?.status === 'enabled' || capability?.status === 'beta';
}

export function useCapabilities() {
  return useQuery({
    queryKey: capabilityKeys.runtime,
    queryFn: async () => {
      const response = await apiClient.GET('/api/v1/capabilities');
      const capabilities = response.data?.data;
      if (capabilities === undefined) {
        throw new Error('API capabilities trả dữ liệu không hợp lệ.');
      }
      return capabilities;
    },
    staleTime: CAPABILITY_REFRESH_MS,
    refetchInterval: CAPABILITY_REFRESH_MS,
    refetchOnWindowFocus: true,
    // Rolling-deploy fallback phải kích hoạt ngay; retry nền sẽ trì hoãn login hiện có.
    retry: false,
  });
}
