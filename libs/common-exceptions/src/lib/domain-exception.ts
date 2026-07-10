/**
 * Base class cho mọi lỗi nghiệp vụ (docs/05 § 5.1, § 5.5).
 * - `code` theo format DOMAIN_SUBJECT_REASON, khai báo tập trung trong `*.errors.ts` của từng module.
 * - `httpStatus` luôn là 4xx — DomainException không bao giờ map ra 500 (docs/05 § 5.5).
 */
export class DomainException extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly httpStatus = 400,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'DomainException';
    if (httpStatus < 400 || httpStatus >= 500) {
      throw new Error(
        `DomainException chỉ được dùng status 4xx, nhận ${httpStatus} cho code ${code}`,
      );
    }
  }
}
