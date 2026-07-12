import {
  HttpStatus,
  applyDecorators,
  createParamDecorator,
} from '@nestjs/common';
import { ApiHeader } from '@nestjs/swagger';
import { CommonErrors, DomainException } from '@litmatch/common-exceptions';

import type { ExecutionContext } from '@nestjs/common';

export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';
const MAX_KEY_LENGTH = 128;

/**
 * Rút idempotency key từ header, validate bắt buộc + độ dài (docs/05 § 5.4, § 5.10).
 * Tách hàm thuần để unit test được không cần dựng Nest context.
 */
export function extractIdempotencyKey(
  headers: Record<string, unknown>,
): string {
  const raw = headers[IDEMPOTENCY_KEY_HEADER];
  const key = Array.isArray(raw) ? raw[0] : raw;
  if (typeof key !== 'string' || key.trim() === '') {
    throw new DomainException(
      CommonErrors.IDEMPOTENCY_KEY_MISSING,
      'Thiếu header Idempotency-Key',
      HttpStatus.BAD_REQUEST,
    );
  }
  if (key.length > MAX_KEY_LENGTH) {
    throw new DomainException(
      CommonErrors.IDEMPOTENCY_KEY_INVALID,
      `Idempotency-Key dài quá ${MAX_KEY_LENGTH} ký tự`,
      HttpStatus.BAD_REQUEST,
    );
  }
  return key;
}

/**
 * Param decorator chuẩn cho MỌI endpoint có tác dụng phụ không được lặp
 * (trừ/cộng diamond, đặt match ticket, tặng quà, settle call, claim thưởng — docs/05 § 5.10):
 *
 *   @Post('gift/send')
 *   @ApiIdempotencyKeyHeader()
 *   sendGift(@IdempotencyKey() idempotencyKey: string, ...) {}
 *
 * Key nhận về LUÔN là string đã validate — service không cần check thiếu key nữa,
 * nhưng vẫn phải tự prefix theo domain (vd `gift:${userId}:${key}`) và
 * dựa vào unique constraint DB trên `Transaction` làm chốt chặn cuối.
 */
export const IdempotencyKey = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx
      .switchToHttp()
      .getRequest<{ headers: Record<string, unknown> }>();
    return extractIdempotencyKey(request.headers);
  },
);

/** Decorator OpenAPI đi kèm — luôn dán cạnh @IdempotencyKey() để Swagger khớp thực tế. */
export function ApiIdempotencyKeyHeader(): MethodDecorator {
  return applyDecorators(
    ApiHeader({
      name: 'Idempotency-Key',
      required: true,
      description:
        'Bắt buộc cho mọi API có tác dụng phụ không được lặp (docs/05 § 5.4, § 5.10)',
    }),
  );
}
