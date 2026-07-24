import { z } from 'zod';

/**
 * Nguồn duy nhất đọc `import.meta.env` (docs/13 § 13.10, guard enforce) — validate lúc
 * boot, thiếu/sai env chết ngay với message rõ, không chạy tiếp với `undefined`.
 * Thêm biến mới: schema này + `.env.example` của app trong cùng PR.
 */
const envSchema = z.object({
  /** Origin core-api, KHÔNG kèm /api/v1 (spec đã chứa prefix trong path). */
  VITE_API_URL: z.url(),
  /** OAuth client id công khai của Google Identity Services. */
  VITE_AUTH_GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  /** Public browser DSN; empty disables error reporting. */
  VITE_SENTRY_DSN: z.url().optional(),
  /** Release environment attached to browser error events. */
  VITE_SENTRY_ENVIRONMENT: z.string().min(1).default('production'),
  /** Immutable release identifier attached to browser error events. */
  VITE_SENTRY_RELEASE: z.string().max(200).optional(),
  /** Cho phép hiển thị flow OTP; production miễn phí đặt false để khớp capability backend. */
  VITE_PHONE_OTP_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
});

export const env = envSchema.parse({
  VITE_API_URL: import.meta.env['VITE_API_URL'],
  VITE_AUTH_GOOGLE_CLIENT_ID:
    import.meta.env['VITE_AUTH_GOOGLE_CLIENT_ID'] || undefined,
  VITE_SENTRY_DSN: import.meta.env['VITE_SENTRY_DSN'] || undefined,
  VITE_SENTRY_ENVIRONMENT:
    import.meta.env['VITE_SENTRY_ENVIRONMENT'] || undefined,
  VITE_SENTRY_RELEASE: import.meta.env['VITE_SENTRY_RELEASE'] || undefined,
  VITE_PHONE_OTP_ENABLED:
    import.meta.env['VITE_PHONE_OTP_ENABLED'] || undefined,
});
