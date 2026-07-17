import { AdminPermission } from '../admin.constants';
import { AdminErrors } from '../admin.errors';
import { AdminPermissionGuard } from './admin-permission.guard';

import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { AdminService } from '../admin.service';

function context(userId = 'user-1'): ExecutionContext {
  return {
    // Guard chỉ dùng identity của handler làm key tra metadata — body không bao giờ chạy
    getHandler: () =>
      function handler() {
        return undefined;
      },
    getClass: () => class Controller {},
    switchToHttp: () => ({
      getRequest: () => ({
        user: { userId, role: 'admin', isGuest: false },
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('AdminPermissionGuard', () => {
  it('cho qua khi policy hiện tại trong DB bật', async () => {
    const reflector = {
      getAllAndOverride: jest
        .fn()
        .mockReturnValue(AdminPermission.ManageConfig),
    } as unknown as Reflector;
    const adminService = {
      hasPermission: jest.fn().mockResolvedValue(true),
    } as unknown as AdminService;
    const guard = new AdminPermissionGuard(reflector, adminService);

    await expect(guard.canActivate(context())).resolves.toBe(true);
    expect(adminService.hasPermission).toHaveBeenCalledWith(
      'user-1',
      AdminPermission.ManageConfig,
    );
  });

  it('deny route mới thiếu metadata permission', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(undefined),
    } as unknown as Reflector;
    const adminService = {
      hasPermission: jest.fn(),
    } as unknown as AdminService;
    const guard = new AdminPermissionGuard(reflector, adminService);

    await expect(guard.canActivate(context())).rejects.toMatchObject({
      code: AdminErrors.PERMISSION_FORBIDDEN,
    });
    expect(adminService.hasPermission).not.toHaveBeenCalled();
  });

  it('deny ngay khi role/policy trong DB đã bị hạ dù token cũ còn admin', async () => {
    const reflector = {
      getAllAndOverride: jest
        .fn()
        .mockReturnValue(AdminPermission.ManagePermissions),
    } as unknown as Reflector;
    const adminService = {
      hasPermission: jest.fn().mockResolvedValue(false),
    } as unknown as AdminService;
    const guard = new AdminPermissionGuard(reflector, adminService);

    await expect(guard.canActivate(context())).rejects.toMatchObject({
      code: AdminErrors.PERMISSION_FORBIDDEN,
    });
  });
});
