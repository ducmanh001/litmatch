import { DomainException } from '@litmatch/common-exceptions';

import {
  clearAuthCookies,
  extractRefreshTokenCookie,
  setAuthCookies,
} from './auth.cookies';
import { AuthErrors } from './auth.errors';

import type { Request, Response } from 'express';

function fakeResponse(): jest.Mocked<Pick<Response, 'cookie' | 'clearCookie'>> {
  return {
    cookie: jest.fn(),
    clearCookie: jest.fn(),
  } as never;
}

describe('setAuthCookies', () => {
  it('set đúng 2 cookie httpOnly, cùng path, secure theo production', () => {
    const res = fakeResponse();
    setAuthCookies(res as unknown as Response, {
      refreshToken: 'r1',
      csrfToken: 'c1',
      isProduction: true,
      ttlDays: 30,
    });

    expect(res.cookie).toHaveBeenCalledWith(
      'refresh_token',
      'r1',
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        path: '/api/v1/auth',
        maxAge: 30 * 24 * 3600 * 1000,
      }),
    );
    expect(res.cookie).toHaveBeenCalledWith(
      'csrf_token',
      'c1',
      expect.objectContaining({ httpOnly: true, secure: true }),
    );
  });

  it('dev (isProduction=false) → secure: false', () => {
    const res = fakeResponse();
    setAuthCookies(res as unknown as Response, {
      refreshToken: 'r1',
      csrfToken: 'c1',
      isProduction: false,
      ttlDays: 30,
    });
    expect(res.cookie).toHaveBeenCalledWith(
      'refresh_token',
      'r1',
      expect.objectContaining({ secure: false }),
    );
  });
});

describe('clearAuthCookies', () => {
  it('xoá cả 2 cookie cùng path đã set lúc issue', () => {
    const res = fakeResponse();
    clearAuthCookies(res as unknown as Response, true);
    expect(res.clearCookie).toHaveBeenCalledWith(
      'refresh_token',
      expect.objectContaining({ path: '/api/v1/auth' }),
    );
    expect(res.clearCookie).toHaveBeenCalledWith(
      'csrf_token',
      expect.objectContaining({ path: '/api/v1/auth' }),
    );
  });
});

describe('extractRefreshTokenCookie', () => {
  function fakeRequest(cookies?: Record<string, string>): Request {
    return { cookies } as unknown as Request;
  }

  it('có cookie → trả đúng giá trị', () => {
    expect(
      extractRefreshTokenCookie(fakeRequest({ refresh_token: 'r1' })),
    ).toBe('r1');
  });

  it.each([[undefined], [{}], [{ refresh_token: '' }]])(
    'thiếu cookie (%j) → throw AUTH_REFRESH_TOKEN_INVALID 401',
    (cookies) => {
      try {
        extractRefreshTokenCookie(fakeRequest(cookies as never));
        fail('phải throw DomainException');
      } catch (e) {
        expect(e).toBeInstanceOf(DomainException);
        expect((e as DomainException).code).toBe(
          AuthErrors.REFRESH_TOKEN_INVALID,
        );
        expect((e as DomainException).httpStatus).toBe(401);
      }
    },
  );
});
