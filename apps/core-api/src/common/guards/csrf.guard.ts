import { CanActivate, HttpStatus, Injectable } from '@nestjs/common';
import { CommonErrors, DomainException } from '@litmatch/common-exceptions';

import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from '../csrf/csrf.constants';
import { isValidCsrfToken } from '../csrf/csrf-token';

import type { ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/**
 * Áp thủ công (`@UseGuards(CsrfGuard)`) trên đúng route đọc cookie httpOnly để đổi trạng thái
 * (ADR 0007: `/auth/refresh`, `/auth/logout`) — KHÔNG đăng ký global vì phần lớn API xác thực
 * bằng `Authorization: Bearer` (cookie không tự gắn kèm header tuỳ biến, CSRF không áp dụng).
 * Route mới sau này đọc cookie tương tự phải tự áp lại guard này, không giả định an toàn.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const cookieValue = (req.cookies as Record<string, string> | undefined)?.[
      CSRF_COOKIE_NAME
    ];
    const headerValue = req.headers[CSRF_HEADER_NAME];
    if (!isValidCsrfToken(cookieValue, headerValue)) {
      throw new DomainException(
        CommonErrors.CSRF_TOKEN_INVALID,
        'CSRF token không hợp lệ hoặc thiếu',
        HttpStatus.UNAUTHORIZED,
      );
    }
    return true;
  }
}
