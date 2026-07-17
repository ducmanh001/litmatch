import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DomainException } from '@litmatch/common-exceptions';

import { AdminPermission, ADMIN_PERMISSION_KEY } from '../admin.constants';
import { AdminErrors } from '../admin.errors';
import { AdminService } from '../admin.service';

import type { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import type { Request } from 'express';

export const RequireAdminPermission = (permission: AdminPermission) =>
  SetMetadata(ADMIN_PERMISSION_KEY, permission);

/**
 * Guard class-level cho AdminController. Role đọc lại từ DB nên downgrade có hiệu lực ngay cả
 * khi access token cũ còn TTL; route mới thiếu metadata bị deny để không vô tình mở quyền.
 */
@Injectable()
export class AdminPermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly adminService: AdminService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const permission = this.reflector.getAllAndOverride<
      AdminPermission | undefined
    >(ADMIN_PERMISSION_KEY, [context.getHandler(), context.getClass()]);
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();

    if (
      permission === undefined ||
      request.user === undefined ||
      !(await this.adminService.hasPermission(request.user.userId, permission))
    ) {
      throw new DomainException(
        AdminErrors.PERMISSION_FORBIDDEN,
        'Không đủ quyền quản trị cho thao tác này',
        HttpStatus.FORBIDDEN,
      );
    }
    return true;
  }
}
