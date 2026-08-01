import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '../../shared/api/client';
import { useIsAuthenticated } from '../../shared/auth/use-session';

import type { ApiSchema } from '@litmatch/api-client';

export type PrivacySettingsDto = ApiSchema<'PrivacySettingsDto'>;
export type UpdatePrivacySettingsDto = ApiSchema<'UpdatePrivacySettingsDto'>;

export const privacyKeys = {
  settings: ['privacy', 'settings'] as const,
};

export function usePrivacySettings() {
  const isAuthenticated = useIsAuthenticated();
  return useQuery({
    queryKey: privacyKeys.settings,
    queryFn: async () => {
      const response = await apiClient.GET('/api/v1/users/me/privacy');
      return response.data?.data;
    },
    enabled: isAuthenticated,
  });
}

export function useUpdatePrivacySettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (settings: UpdatePrivacySettingsDto) => {
      const response = await apiClient.PUT('/api/v1/users/me/privacy', {
        body: settings,
      });
      return response.data?.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: privacyKeys.settings });
    },
  });
}
