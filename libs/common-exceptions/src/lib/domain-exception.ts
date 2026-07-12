import { HttpStatus } from '@nestjs/common';

/**
 * Base class cho mọi lỗi nghiệp vụ (docs/05 § 5.1, § 5.5).
 * - `code` theo format DOMAIN_SUBJECT_REASON, khai báo tập trung trong `*.errors.ts` của từng module.
 * - `httpStatus` luôn là 4xx — DomainException không bao giờ map ra 500 (docs/05 § 5.5).
 *   Truyền bằng enum `HttpStatus` của @nestjs/common, không viết số trần (docs/10 § 10.1.G).
 */
export class DomainException extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly httpStatus: number = HttpStatus.BAD_REQUEST,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'DomainException';
    if (httpStatus < HttpStatus.BAD_REQUEST || httpStatus >= HttpStatus.INTERNAL_SERVER_ERROR) {
      throw new Error(
        `DomainException chỉ được dùng status 4xx, nhận ${httpStatus} cho code ${code}`,
      );
    }
  }
}
