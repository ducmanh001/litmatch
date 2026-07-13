import { ExecutionContext, createParamDecorator } from '@nestjs/common';

import type { Role } from '@litmatch/common-dtos';

export interface AuthenticatedUser {
  userId: string;
  isGuest: boolean;
  role: Role;
}

/** Lấy user đã xác thực từ request (do JwtAuthGuard gắn vào). */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const req = ctx.switchToHttp().getRequest<{ user: AuthenticatedUser }>();
    return req.user;
  },
);
