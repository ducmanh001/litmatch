import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '../../shared/api/client';

import type { ApiSchema } from '@litmatch/api-client';

export type AdminPermissionMatrixDto = ApiSchema<'AdminPermissionMatrixDto'>;
export type AdminRolePermissionDto = ApiSchema<'AdminRolePermissionDto'>;
export type AdminStaffDto = ApiSchema<'AdminStaffDto'>;

export const permissionKeys = {
  matrix: ['admin', 'permissions', 'matrix'] as const,
  staff: ['admin', 'permissions', 'staff'] as const,
};

export function usePermissionMatrix() {
  return useQuery({
    queryKey: permissionKeys.matrix,
    queryFn: async () => {
      const response = await apiClient.GET('/api/v1/admin/permissions');
      return response.data?.data;
    },
  });
}

export function useSetRolePermission() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      role: 'moderator' | 'admin';
      permission: AdminRolePermissionDto['permission'];
      enabled: boolean;
    }) => {
      await apiClient.PATCH('/api/v1/admin/permissions/{role}/{permission}', {
        params: {
          path: { role: input.role, permission: input.permission },
        },
        body: { enabled: input.enabled },
      });
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: permissionKeys.matrix }),
  });
}

export function useStaff() {
  return useQuery({
    queryKey: permissionKeys.staff,
    queryFn: async () => {
      const response = await apiClient.GET('/api/v1/admin/staff');
      return response.data?.data;
    },
  });
}

export function useSetStaffRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      role: 'user' | 'moderator' | 'admin';
    }) => {
      const response = await apiClient.PATCH('/api/v1/admin/staff/{id}/role', {
        params: { path: { id: input.id } },
        body: { role: input.role },
      });
      return response.data?.data;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: permissionKeys.staff }),
  });
}
