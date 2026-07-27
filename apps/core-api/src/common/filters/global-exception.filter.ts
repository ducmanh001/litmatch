import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { CommonErrors, DomainException } from '@litmatch/common-exceptions';
import { captureSentryException } from '@litmatch/observability';

import {
  localizeErrorMessage,
  resolveApiLocale,
} from '../i18n/error-message.localizer';

import type { ApiErrorBody } from '@litmatch/common-dtos';
import type { Request, Response } from 'express';

/**
 * Format lỗi thống nhất { error: { code, message, traceId } } (docs/05 § 5.5).
 * - DomainException → giữ nguyên code 4xx của domain
 * - HttpException framework (validation, 404, 429...) → map sang mã COMMON_*
 * - Còn lại → 500 COMMON_INTERNAL_ERROR, log đầy đủ, KHÔNG lộ chi tiết nội bộ ra ngoài
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { id?: string }>();
    const traceId = req.id ?? 'unknown';
    const locale = resolveApiLocale(req.headers['accept-language']);

    let status: number;
    let code: string;
    let message: string;
    let details: Record<string, unknown> | undefined;

    if (exception instanceof DomainException) {
      status = exception.httpStatus;
      code = exception.code;
      message = exception.message;
      details = exception.details;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      message =
        typeof body === 'string'
          ? body
          : ((body as { message?: string | string[] }).message?.toString() ??
            exception.message);
      code = this.mapHttpStatusToCode(status);
      if (status === HttpStatus.BAD_REQUEST && typeof body === 'object') {
        const raw = (body as { message?: string | string[] }).message;
        if (Array.isArray(raw)) {
          code = CommonErrors.VALIDATION_FAILED;
          message = 'Dữ liệu đầu vào không hợp lệ';
          details = { violations: raw };
        }
      }
    } else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      code = CommonErrors.INTERNAL_ERROR;
      message = 'Lỗi hệ thống, thử lại sau';
      this.logger.error(
        {
          traceId,
          err: exception instanceof Error ? exception.stack : String(exception),
        },
        'Unhandled exception',
      );
      captureSentryException(exception, traceId);
    }

    const payload: ApiErrorBody = {
      error: {
        code,
        message: localizeErrorMessage(code, locale, message),
        traceId,
        ...(details ? { details } : {}),
      },
    };
    res.status(status).json(payload);
  }

  private mapHttpStatusToCode(status: number): string {
    switch (status) {
      case HttpStatus.UNAUTHORIZED:
        return CommonErrors.UNAUTHORIZED;
      case HttpStatus.FORBIDDEN:
        return CommonErrors.FORBIDDEN;
      case HttpStatus.NOT_FOUND:
        return CommonErrors.ROUTE_NOT_FOUND;
      case HttpStatus.TOO_MANY_REQUESTS:
        return CommonErrors.RATE_LIMITED;
      case HttpStatus.BAD_REQUEST:
        return CommonErrors.VALIDATION_FAILED;
      default:
        return CommonErrors.INTERNAL_ERROR;
    }
  }
}
