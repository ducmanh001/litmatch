import { CommonErrors, DomainException } from '@litmatch/common-exceptions';

import { CsrfGuard } from './csrf.guard';

import type { ExecutionContext } from '@nestjs/common';

function contextWith(cookies: unknown, headerValue: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        cookies,
        headers: { 'x-csrf-token': headerValue },
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('CsrfGuard', () => {
  const guard = new CsrfGuard();

  it('cookie khớp header → allow', () => {
    expect(guard.canActivate(contextWith({ csrf_token: 'abc' }, 'abc'))).toBe(
      true,
    );
  });

  it('cookie khác header → 401 COMMON_CSRF_TOKEN_INVALID', () => {
    try {
      guard.canActivate(contextWith({ csrf_token: 'abc' }, 'khac'));
      fail('phải throw DomainException');
    } catch (e) {
      expect(e).toBeInstanceOf(DomainException);
      expect((e as DomainException).code).toBe(CommonErrors.CSRF_TOKEN_INVALID);
      expect((e as DomainException).httpStatus).toBe(401);
    }
  });

  it('thiếu cookie hoặc header → 401', () => {
    expect(() => guard.canActivate(contextWith(undefined, 'abc'))).toThrow(
      DomainException,
    );
    expect(() =>
      guard.canActivate(contextWith({ csrf_token: 'abc' }, undefined)),
    ).toThrow(DomainException);
  });
});
