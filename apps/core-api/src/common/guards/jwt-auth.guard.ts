import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';

import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { verifyJwtWithRotation } from './jwt-rotation';

import type { CoreApiEnv } from '../../config/env.validation';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';
import type { AccessTokenPayload } from '@litmatch/common-dtos';
import type { Request } from 'express';

/**
 * Guard global: mọi endpoint mặc định yêu cầu Bearer access token, trừ khi có @Public().
 * Access token là stateless JWT TTL ngắn — trạng thái banned được kiểm tra lại
 * tại refresh/login (không query DB mỗi request; TTL ngắn giới hạn cửa sổ rủi ro).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  /** Khoá cũ trong cửa sổ xoay `JWT_SECRET`; undefined khi không xoay. */
  private readonly previousSecret: string | undefined;

  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
    config: ConfigService<CoreApiEnv, true>,
  ) {
    this.previousSecret =
      config.get('JWT_SECRET_PREVIOUS', { infer: true }) || undefined;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Thiếu access token');
    }

    try {
      const payload = await verifyJwtWithRotation<AccessTokenPayload>(
        this.jwtService,
        authHeader.slice('Bearer '.length),
        this.previousSecret,
      );
      req.user = {
        userId: payload.sub,
        isGuest: payload.isGuest === true,
        role: payload.role,
      };
      return true;
    } catch {
      throw new UnauthorizedException(
        'Access token không hợp lệ hoặc đã hết hạn',
      );
    }
  }
}
