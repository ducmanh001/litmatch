/** Mã lỗi dùng chung, không thuộc domain cụ thể nào (docs/05 § 5.5). */
export const CommonErrors = {
  VALIDATION_FAILED: 'COMMON_VALIDATION_FAILED',
  ROUTE_NOT_FOUND: 'COMMON_ROUTE_NOT_FOUND',
  RATE_LIMITED: 'COMMON_RATE_LIMITED',
  UNAUTHORIZED: 'COMMON_UNAUTHORIZED',
  FORBIDDEN: 'COMMON_FORBIDDEN',
  INTERNAL_ERROR: 'COMMON_INTERNAL_ERROR',
} as const;

export type CommonErrorCode = (typeof CommonErrors)[keyof typeof CommonErrors];
