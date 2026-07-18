import { HttpStatus } from '@nestjs/common';
import { DomainException } from '@litmatch/common-exceptions';

import { CSRF_COOKIE_NAME } from '../../common/csrf/csrf.constants';

import { AuthErrors } from './auth.errors';
import {
  REFRESH_TOKEN_COOKIE_NAME,
  REFRESH_TOKEN_COOKIE_PATH,
} from './auth.constants';

import type { CookieOptions, Request, Response } from 'express';

/**
 * Cookie options dùng chung cho refresh token + CSRF (ADR 0007) — cùng path/lifetime, tách
 * hàm thuần để test không cần dựng Express response giả lập phức tạp. `csrf_token` cũng để
 * `httpOnly: true`: FE nhận giá trị qua JSON body lúc login/refresh (không đọc qua
 * `document.cookie` — `web`/`admin` khác origin với `core-api`), cookie chỉ để SERVER so khớp
 * lại lúc verify, không có lý do phải JS-readable.
 */
function cookieOptions(
  isProduction: boolean,
  ttlDays: number,
  crossOriginDev: boolean, // true khi test qua tunnel/LAN IP (frontend & backend khác origin)
): CookieOptions {
  return {
    httpOnly: true,
    // sameSite: 'none' bắt buộc đi kèm secure: true (browser spec) — tunnel dùng HTTPS nên vẫn ổn ở dev
    secure: isProduction || crossOriginDev,
    sameSite: isProduction ? 'strict' : crossOriginDev ? 'none' : 'strict',
    path: REFRESH_TOKEN_COOKIE_PATH,
    maxAge: ttlDays * 24 * 3600 * 1000,
  };
}

export function setAuthCookies(
  res: Response,
  input: {
    refreshToken: string;
    csrfToken: string;
    isProduction: boolean;
    crossOriginDev?: boolean;
    ttlDays: number;
  },
): void {
  const options = cookieOptions(
    input.isProduction,
    input.ttlDays,
    input.crossOriginDev ?? false,
  );
  res.cookie(REFRESH_TOKEN_COOKIE_NAME, input.refreshToken, options);
  res.cookie(CSRF_COOKIE_NAME, input.csrfToken, options);
}

export function clearAuthCookies(
  res: Response,
  isProduction: boolean,
  crossOriginDev = false,
): void {
  const options = cookieOptions(isProduction, 0, crossOriginDev);
  res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, options);
  res.clearCookie(CSRF_COOKIE_NAME, options);
}
/**
 * Đọc refresh token từ cookie httpOnly (`/auth/refresh`, `/auth/logout` — ADR 0007). Tách hàm
 * thuần để test không cần dựng Nest context, cùng convention `extractIdempotencyKey`.
 */
export function extractRefreshTokenCookie(req: Request): string {
  const value = (req.cookies as Record<string, string> | undefined)?.[
    REFRESH_TOKEN_COOKIE_NAME
  ];
  if (typeof value !== 'string' || value === '') {
    throw new DomainException(
      AuthErrors.REFRESH_TOKEN_INVALID,
      'Thiếu refresh token cookie',
      HttpStatus.UNAUTHORIZED,
    );
  }
  return value;
}
