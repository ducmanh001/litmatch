/** Locale API được hỗ trợ. Header không hợp lệ luôn rơi về tiếng Việt. */
export type ApiLocale = 'vi' | 'en';

const DEFAULT_LOCALE: ApiLocale = 'vi';

const EN_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  COMMON_VALIDATION_FAILED: 'The submitted data is invalid.',
  COMMON_ROUTE_NOT_FOUND: 'The requested route was not found.',
  COMMON_RATE_LIMITED: 'Too many requests. Please try again later.',
  COMMON_UNAUTHORIZED: 'Authentication is required.',
  COMMON_FORBIDDEN: 'You do not have permission to perform this action.',
  COMMON_INTERNAL_ERROR: 'Something went wrong. Please try again later.',
  COMMON_IDEMPOTENCY_KEY_MISSING: 'An idempotency key is required.',
  COMMON_IDEMPOTENCY_KEY_INVALID: 'The idempotency key is invalid.',
  COMMON_CSRF_TOKEN_INVALID: 'The security token is invalid or has expired.',
  AUTH_OTP_INVALID: 'The verification code is incorrect.',
  AUTH_OTP_EXPIRED: 'The verification code has expired or was not requested.',
  AUTH_OTP_TOO_MANY_ATTEMPTS:
    'Too many incorrect attempts. Please request a new code.',
  AUTH_OTP_REQUEST_RATE_LIMITED:
    'Too many verification-code requests. Please try again later.',
  AUTH_REFRESH_TOKEN_INVALID: 'Your session is invalid. Please sign in again.',
  AUTH_REFRESH_TOKEN_REUSED: 'Your session has expired. Please sign in again.',
  AUTH_SOCIAL_TOKEN_INVALID: 'The social sign-in token is invalid.',
  AUTH_SOCIAL_PROVIDER_NOT_SUPPORTED:
    'This social sign-in provider is not supported.',
  AUTH_USER_BANNED: 'This account has been suspended.',
};

/**
 * Đọc thẻ ngôn ngữ đầu tiên được hỗ trợ theo RFC 9110. Không ném lỗi cho header do client gửi.
 */
export function resolveApiLocale(
  acceptLanguage: string | string[] | undefined,
): ApiLocale {
  const value = Array.isArray(acceptLanguage)
    ? acceptLanguage.join(',')
    : acceptLanguage;
  if (value === undefined) return DEFAULT_LOCALE;

  for (const item of value.split(',')) {
    const language = item.trim().split(';', 1)[0]?.toLowerCase();
    if (language === 'en' || language?.startsWith('en-')) return 'en';
    if (language === 'vi' || language?.startsWith('vi-')) return 'vi';
  }
  return DEFAULT_LOCALE;
}

/**
 * Error code là contract ổn định; bản dịch chỉ là presentation ở API boundary. Code chưa có
 * catalog tiếng Anh dùng fallback an toàn, không làm lộ message nội bộ hoặc trộn tiếng Việt.
 */
export function localizeErrorMessage(
  code: string,
  locale: ApiLocale,
  vietnameseMessage: string,
): string {
  if (locale === 'vi') return vietnameseMessage;
  return EN_ERROR_MESSAGES[code] ?? 'The request could not be completed.';
}
