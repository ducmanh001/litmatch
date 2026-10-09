import { UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';

import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';

import type { ConfigService } from '@nestjs/config';
import type { ExecutionContext } from '@nestjs/common';

import type { CoreApiEnv } from '../../config/env.validation';

const CURRENT = 'current-secret-0123456789abcdef0123456789abcdef';
const PREVIOUS = 'previous-secret-0123456789abcdef0123456789abcde';

function makeGuard(previous = '') {
  const config = {
    get: (key: string) =>
      key === 'JWT_SECRET_PREVIOUS' ? previous : undefined,
  } as unknown as ConfigService<CoreApiEnv, true>;
  return new JwtAuthGuard(
    new JwtService({ secret: CURRENT }),
    new Reflector(),
    config,
  );
}

function makeContext(authorization?: string, isPublic = false) {
  const request: { headers: Record<string, string>; user?: unknown } = {
    headers: authorization ? { authorization } : {},
  };
  const handler = (): void => undefined;
  class Controller {}
  if (isPublic) Reflect.defineMetadata(IS_PUBLIC_KEY, true, handler);
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => handler,
    getClass: () => Controller,
  } as unknown as ExecutionContext;
  return { context, request };
}

const sign = (secret: string, payload: object = {}): Promise<string> =>
  new JwtService({ secret }).signAsync(
    { sub: 'user-1', isGuest: false, role: 'user', ...payload },
    { expiresIn: '5m' },
  );

describe('JwtAuthGuard', () => {
  it('route @Public bỏ qua kiểm tra token', async () => {
    const { context } = makeContext(undefined, true);
    await expect(makeGuard().canActivate(context)).resolves.toBe(true);
  });

  it('thiếu Bearer token → 401', async () => {
    const { context } = makeContext();
    await expect(makeGuard().canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('token ký bằng khoá hiện tại → gán req.user', async () => {
    const { context, request } = makeContext(`Bearer ${await sign(CURRENT)}`);

    await expect(makeGuard().canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual({
      userId: 'user-1',
      isGuest: false,
      role: 'user',
    });
  });

  it('token ký bằng khoá cũ → chấp nhận khi đang xoay khoá (JWT_SECRET_PREVIOUS)', async () => {
    const { context, request } = makeContext(`Bearer ${await sign(PREVIOUS)}`);

    await expect(makeGuard(PREVIOUS).canActivate(context)).resolves.toBe(true);
    expect(request.user).toMatchObject({ userId: 'user-1' });
  });

  it('token ký bằng khoá cũ → 401 khi không có JWT_SECRET_PREVIOUS', async () => {
    const { context } = makeContext(`Bearer ${await sign(PREVIOUS)}`);

    await expect(makeGuard().canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
