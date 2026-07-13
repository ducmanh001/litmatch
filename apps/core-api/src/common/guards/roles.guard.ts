import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CommonErrors, DomainException } from '@litmatch/common-exceptions';

import { ROLES_KEY } from '../decorators/roles.decorator';

import type { AuthenticatedUser } from '../decorators/current-user.decorator';
import type { Role } from '@litmatch/common-dtos';
import type { Request } from 'express';

/**
 * Guard global (đăng ký NGAY SAU JwtAuthGuard trong app.module.ts để req.user luôn có khi
 * tới lượt check role). Route không khai @RequireRoles() thì KHÔNG áp RBAC — giữ nguyên
 * hành vi hiện có (chỉ cần JwtAuthGuard). Route CÓ khai thì deny-by-default: thiếu req.user
 * hoặc role không khớp đều bị chặn — không giả định thứ tự guard mãi đúng (docs/10 § 10.0).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (requiredRoles === undefined) return true;

    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();
    if (req.user === undefined || !requiredRoles.includes(req.user.role)) {
      throw new DomainException(
        CommonErrors.FORBIDDEN,
        'Không đủ quyền truy cập',
        HttpStatus.FORBIDDEN,
      );
    }
    return true;
  }
}
