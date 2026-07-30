import { useQuery } from '@tanstack/react-query';

import { apiClient } from '../api/client';

import type { ApiSchema } from '@litmatch/api-client';

export type CapabilitiesDto = ApiSchema<'CapabilitiesDto'>;
export type CapabilityStateDto = ApiSchema<'CapabilityStateDto'>;

export const capabilityKeys = {
  runtime: ['capabilities', 'runtime'] as const,
};

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
    // Capability/env chỉ đổi cùng một lần deploy stack; bản hosted mới hoặc reload sẽ fetch lại.
    staleTime: Infinity,
    // Rolling-deploy fallback phải kích hoạt ngay; retry nền sẽ trì hoãn login/top-up hiện có.
    retry: false,
  });
}
