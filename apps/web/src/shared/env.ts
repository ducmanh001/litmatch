import { z } from 'zod';

/**
 * Nguồn duy nhất đọc env phía client (docs/13 § 13.10, guard enforce). Next inline
 * `process.env.NEXT_PUBLIC_*` lúc build theo TÊN BIẾN literal — bắt buộc liệt kê từng biến,
 * không đọc động. Prefix NEXT_PUBLIC = công khai trong bundle, không bao giờ chứa secret.
 */
const envSchema = z
  .object({
    /** Public origin used for canonical URLs, sitemap and social previews. */
    NEXT_PUBLIC_SITE_URL: z.url().default('http://localhost:4300'),
    /** Optional Google Search Console verification token. */
    NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION: z.string().min(1).optional(),
    /** Origin core-api, KHÔNG kèm /api/v1 (spec đã chứa prefix trong path). */
    NEXT_PUBLIC_API_URL: z.url(),
    /** Origin signaling-gateway (Socket.IO). */
    NEXT_PUBLIC_SOCKET_URL: z.url(),
    /** URL LiveKit SFU (ws://). */
    NEXT_PUBLIC_LIVEKIT_URL: z.url(),
    /** Compatibility fallback khi backend cũ chưa có capability endpoint. */
    NEXT_PUBLIC_AUTH_GOOGLE_CLIENT_ID: z.string().optional(),
    /** Compatibility fallback khi backend cũ chưa có capability endpoint. */
    NEXT_PUBLIC_AUTH_APPLE_CLIENT_ID: z.string().optional(),
    /** Compatibility fallback khi backend cũ chưa có capability endpoint. */
    NEXT_PUBLIC_AUTH_FACEBOOK_APP_ID: z.string().optional(),
    /** Pin the Facebook SDK/Graph API generation; update through env before Meta retires it. */
    NEXT_PUBLIC_AUTH_FACEBOOK_API_VERSION: z
      .string()
      .regex(/^v\d+\.\d+$/u)
      .default('v24.0'),
    /** Browser error-monitoring DSN; empty means Sentry is off. */
    NEXT_PUBLIC_SENTRY_DSN: z.url().optional(),
    /** Release environment attached to browser error events. */
    NEXT_PUBLIC_SENTRY_ENVIRONMENT: z.string().min(1).default('production'),
    /** Immutable release identifier attached to browser error events. */
    NEXT_PUBLIC_SENTRY_RELEASE: z.string().max(200).optional(),
    /** Compatibility fallback khi backend cũ chưa có capability endpoint. */
    NEXT_PUBLIC_PHONE_OTP_ENABLED: z
      .enum(['true', 'false'])
      .default('true')
      .transform((value) => value === 'true'),
    /** Bật Eruda cho kiểm thử mobile qua tunnel; mặc định tắt ở mọi môi trường khác. */
    NEXT_PUBLIC_ENABLE_ERUDA: z.enum(['true', 'false']).default('false'),
    /** PostHog project token công khai; để trống thì analytics tắt hoàn toàn. */
    NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN: z.string().min(1).optional(),
    /** Ingestion host đúng region của PostHog Cloud (EU/US). */
    NEXT_PUBLIC_POSTHOG_HOST: z.url().optional(),
  })
  .refine(
    (value) =>
      (value.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN === undefined) ===
      (value.NEXT_PUBLIC_POSTHOG_HOST === undefined),
    {
      message: 'PostHog project token và host phải được cấu hình cùng nhau',
      path: ['NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN'],
    },
  );

export const env = envSchema.parse({
  NEXT_PUBLIC_SITE_URL: process.env['NEXT_PUBLIC_SITE_URL'] || undefined,
  NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION:
    process.env['NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION'] || undefined,
  NEXT_PUBLIC_API_URL: process.env['NEXT_PUBLIC_API_URL'],
  NEXT_PUBLIC_SOCKET_URL: process.env['NEXT_PUBLIC_SOCKET_URL'],
  NEXT_PUBLIC_LIVEKIT_URL: process.env['NEXT_PUBLIC_LIVEKIT_URL'],
  NEXT_PUBLIC_AUTH_GOOGLE_CLIENT_ID:
    process.env['NEXT_PUBLIC_AUTH_GOOGLE_CLIENT_ID'] || undefined,
  NEXT_PUBLIC_AUTH_APPLE_CLIENT_ID:
    process.env['NEXT_PUBLIC_AUTH_APPLE_CLIENT_ID'] || undefined,
  NEXT_PUBLIC_AUTH_FACEBOOK_APP_ID:
    process.env['NEXT_PUBLIC_AUTH_FACEBOOK_APP_ID'] || undefined,
  NEXT_PUBLIC_AUTH_FACEBOOK_API_VERSION:
    process.env['NEXT_PUBLIC_AUTH_FACEBOOK_API_VERSION'] || undefined,
  NEXT_PUBLIC_SENTRY_DSN: process.env['NEXT_PUBLIC_SENTRY_DSN'] || undefined,
  NEXT_PUBLIC_SENTRY_ENVIRONMENT:
    process.env['NEXT_PUBLIC_SENTRY_ENVIRONMENT'] || undefined,
  NEXT_PUBLIC_SENTRY_RELEASE:
    process.env['NEXT_PUBLIC_SENTRY_RELEASE'] || undefined,
  NEXT_PUBLIC_PHONE_OTP_ENABLED:
    process.env['NEXT_PUBLIC_PHONE_OTP_ENABLED'] || undefined,
  NEXT_PUBLIC_ENABLE_ERUDA:
    process.env['NEXT_PUBLIC_ENABLE_ERUDA'] || undefined,
  NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN:
    process.env['NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN'] || undefined,
  NEXT_PUBLIC_POSTHOG_HOST:
    process.env['NEXT_PUBLIC_POSTHOG_HOST'] || undefined,
});
