import { Reflector } from '@nestjs/core';

import { RolesGuard } from './roles.guard';

import type { ExecutionContext } from '@nestjs/common';
import type { Role } from '@litmatch/common-dtos';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';

// Literal thay vì import `Roles` (giá trị runtime) từ @litmatch/common-dtos — file này không
// bootstrap qua Nest testing module nên chưa chắc đã nạp `reflect-metadata`; import type-only
// không kéo theo runtime của cursor-pagination.ts (dùng class-validator decorator).
const ADMIN: Role = 'admin';
const MODERATOR: Role = 'moderator';
const USER: Role = 'user';

function fakeContext(user?: AuthenticatedUser): ExecutionContext {
  return {
    getHandler: () => ({}) as never,
    getClass: () => ({}) as never,
    switchToHttp: () => ({ getRequest: () => ({ user }) }) as never,
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  it('cho qua khi route không khai @RequireRoles() — giữ nguyên hành vi cũ', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(undefined),
    };
    const guard = new RolesGuard(reflector as unknown as Reflector);
    expect(
      guard.canActivate(
        fakeContext({ userId: 'u1', isGuest: false, role: USER }),
      ),
    ).toBe(true);
  });

  it('cho qua khi role khớp yêu cầu', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([ADMIN, MODERATOR]),
    };
    const guard = new RolesGuard(reflector as unknown as Reflector);
    expect(
      guard.canActivate(
        fakeContext({ userId: 'u1', isGuest: false, role: ADMIN }),
      ),
    ).toBe(true);
  });

  it('chặn khi role không khớp — DomainException COMMON_FORBIDDEN', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([ADMIN]),
    };
    const guard = new RolesGuard(reflector as unknown as Reflector);
    expect(() =>
      guard.canActivate(
        fakeContext({ userId: 'u1', isGuest: false, role: USER }),
      ),
    ).toThrow(/quyền/);
  });

  it('chặn khi thiếu req.user (tự vệ nếu thứ tự guard đổi) dù có khai role yêu cầu', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([ADMIN]),
    };
    const guard = new RolesGuard(reflector as unknown as Reflector);
    expect(() => guard.canActivate(fakeContext(undefined))).toThrow(/quyền/);
  });
});
