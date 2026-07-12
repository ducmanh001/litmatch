import {
  baseEnvSchema,
  createConfigValidator,
} from '@litmatch/config-validator';
import * as Joi from 'joi';

/**
 * Khớp 1-1 với `coreApiEnvSchema` bên dưới — dùng làm type param cho `ConfigService<CoreApiEnv, true>`
 * (docs/05 § 5.2): `getOrThrow('KEY', { infer: true })` tự suy kiểu, gõ sai/thiếu key báo lỗi
 * lúc build thay vì chỉ vỡ lúc chạy. Sửa 1 key ở schema thì sửa luôn ở đây (không có cách tự
 * sinh type từ `Joi.ObjectSchema`, đây là giới hạn đã biết, chấp nhận đánh đổi).
 */
export interface CoreApiEnv {
  NODE_ENV: 'development' | 'test' | 'production';
  LOG_LEVEL: 'trace' | 'debug' | 'info' | 'warn' | 'error';
  PORT: number;
  CORS_ORIGINS: string;
  SWAGGER_ENABLED: boolean;
  DATABASE_URL: string;
  REDIS_URL: string;
  KAFKA_BROKERS: string;
  JWT_SECRET: string;
  JWT_ACCESS_TTL_SECONDS: number;
  AUTH_REFRESH_TTL_DAYS: number;
  AUTH_OTP_TTL_SECONDS: number;
  AUTH_OTP_MAX_ATTEMPTS: number;
  AUTH_OTP_REQUESTS_PER_HOUR: number;
  AUTH_OTP_PEPPER: string;
  AUTH_MIN_AGE: number;
  AUTH_GOOGLE_CLIENT_ID: string;
  AUTH_APPLE_CLIENT_ID: string;
  USER_DEFAULT_AVATAR_ID: string;
  ECONOMY_IAP_VERIFIER: 'dev' | 'store';
  ECONOMY_APPLE_SHARED_SECRET: string;
  ECONOMY_GOOGLE_PACKAGE_NAME: string;
  ECONOMY_GOOGLE_SA_EMAIL: string;
  ECONOMY_GOOGLE_SA_PRIVATE_KEY: string;
  ECONOMY_OUTBOX_RELAY_ENABLED: boolean;
  ECONOMY_OUTBOX_RELAY_INTERVAL_MS: number;
  ECONOMY_RECONCILIATION_ENABLED: boolean;
  ECONOMY_RECONCILIATION_INTERVAL_MS: number;
  ECONOMY_APPLE_WEBHOOK_VERIFIER: 'dev' | 'store';
  ECONOMY_APPLE_ROOT_CA_PEM: string;
  ECONOMY_GOOGLE_RTDN_VERIFIER: 'dev' | 'store';
  ECONOMY_GOOGLE_RTDN_AUDIENCE: string;
  ECONOMY_GOOGLE_RTDN_SERVICE_ACCOUNT_EMAIL: string;
  ECONOMY_APPLE_ISSUER_ID: string;
  ECONOMY_APPLE_KEY_ID: string;
  ECONOMY_APPLE_PRIVATE_KEY: string;
  ECONOMY_APPLE_BUNDLE_ID: string;
  ECONOMY_APPLE_SERVER_API_ENV: 'sandbox' | 'production';
  ECONOMY_REFUND_POLL_ENABLED: boolean;
  ECONOMY_REFUND_POLL_INTERVAL_MS: number;
  ECONOMY_REFUND_POLL_WINDOW_DAYS: number;
  MATCHING_MATCHER_INTERVAL_MS: number;
  MATCHING_MATCHER_BATCH_SIZE: number;
  MATCHING_SWEEPER_INTERVAL_MS: number;
  MATCHING_QUEUE_MAX_WAIT_SECONDS: number;
  MATCHING_CONFIRM_TIMEOUT_SECONDS: number;
  MATCHING_AGE_BAND_SIZE: number;
  MATCHING_SPEEDUP_PRICE_DIAMOND: number;
  MATCHING_SPEEDUP_MAX_PER_HOUR: number;
  MATCHING_PRIORITY_BOOST_MS: number;
  THROTTLE_TTL_SECONDS: number;
  THROTTLE_LIMIT: number;
}

/**
 * Toàn bộ env key của core-api — không hardcode giá trị nghiệp vụ trong code (docs/05 § 5.1).
 * Naming: UPPER_SNAKE có prefix domain (docs/05 § 5.6).
 */
export const coreApiEnvSchema = Joi.object({
  ...baseEnvSchema,
  PORT: Joi.number().port().default(3000),
  CORS_ORIGINS: Joi.string().allow('').default(''),
  SWAGGER_ENABLED: Joi.boolean().default(true),

  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgres', 'postgresql'] })
    .required(),
  REDIS_URL: Joi.string()
    .uri({ scheme: ['redis'] })
    .default('redis://localhost:6379'),
  KAFKA_BROKERS: Joi.string().default('localhost:9092'),

  JWT_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_TTL_SECONDS: Joi.number().integer().min(60).default(900),

  AUTH_REFRESH_TTL_DAYS: Joi.number().integer().min(1).default(30),
  AUTH_OTP_TTL_SECONDS: Joi.number().integer().min(60).default(300),
  AUTH_OTP_MAX_ATTEMPTS: Joi.number().integer().min(1).default(5),
  AUTH_OTP_REQUESTS_PER_HOUR: Joi.number().integer().min(1).default(5),
  AUTH_OTP_PEPPER: Joi.string().min(16).required(),
  AUTH_MIN_AGE: Joi.number().integer().min(13).default(18),
  AUTH_GOOGLE_CLIENT_ID: Joi.string().allow('').default(''),
  AUTH_APPLE_CLIENT_ID: Joi.string().allow('').default(''),

  USER_DEFAULT_AVATAR_ID: Joi.string().default('default-01'),

  ECONOMY_IAP_VERIFIER: Joi.string().valid('dev', 'store').default('dev'),
  ECONOMY_APPLE_SHARED_SECRET: Joi.string().allow('').default(''),
  ECONOMY_GOOGLE_PACKAGE_NAME: Joi.string().allow('').default(''),
  ECONOMY_GOOGLE_SA_EMAIL: Joi.string().allow('').default(''),
  ECONOMY_GOOGLE_SA_PRIVATE_KEY: Joi.string().allow('').default(''),
  ECONOMY_OUTBOX_RELAY_ENABLED: Joi.boolean().default(false),
  ECONOMY_OUTBOX_RELAY_INTERVAL_MS: Joi.number()
    .integer()
    .min(200)
    .default(2000),
  ECONOMY_RECONCILIATION_ENABLED: Joi.boolean().default(true),
  ECONOMY_RECONCILIATION_INTERVAL_MS: Joi.number()
    .integer()
    .min(10_000)
    .default(300_000),

  // Refund/chargeback (docs/services/economy-service.md § 5)
  // Mặc định 'store' (fail-closed) — thiếu config thì getOrThrow() chết ngay lúc verify thay vì
  // âm thầm chấp nhận webhook giả mạo nếu ai đó quên set biến này ở production (docs/10 § Economy).
  ECONOMY_APPLE_WEBHOOK_VERIFIER: Joi.string()
    .valid('dev', 'store')
    .default('store'),
  ECONOMY_APPLE_ROOT_CA_PEM: Joi.string().allow('').default(''),
  ECONOMY_GOOGLE_RTDN_VERIFIER: Joi.string()
    .valid('dev', 'store')
    .default('store'),
  ECONOMY_GOOGLE_RTDN_AUDIENCE: Joi.string().allow('').default(''),
  ECONOMY_GOOGLE_RTDN_SERVICE_ACCOUNT_EMAIL: Joi.string().allow('').default(''),
  ECONOMY_APPLE_ISSUER_ID: Joi.string().allow('').default(''),
  ECONOMY_APPLE_KEY_ID: Joi.string().allow('').default(''),
  ECONOMY_APPLE_PRIVATE_KEY: Joi.string().allow('').default(''),
  ECONOMY_APPLE_BUNDLE_ID: Joi.string().allow('').default(''),
  ECONOMY_APPLE_SERVER_API_ENV: Joi.string()
    .valid('sandbox', 'production')
    .default('sandbox'),
  ECONOMY_REFUND_POLL_ENABLED: Joi.boolean().default(false),
  ECONOMY_REFUND_POLL_INTERVAL_MS: Joi.number()
    .integer()
    .min(60_000)
    .default(3_600_000),
  ECONOMY_REFUND_POLL_WINDOW_DAYS: Joi.number().integer().min(1).default(60),

  // Matching — Giai đoạn 2 M1 (docs/services/matching-service.md § 8); default khớp .env.example
  MATCHING_MATCHER_INTERVAL_MS: Joi.number().integer().min(50).default(300),
  MATCHING_MATCHER_BATCH_SIZE: Joi.number().integer().min(1).default(20),
  MATCHING_SWEEPER_INTERVAL_MS: Joi.number().integer().min(500).default(5000),
  MATCHING_QUEUE_MAX_WAIT_SECONDS: Joi.number().integer().min(5).default(120),
  MATCHING_CONFIRM_TIMEOUT_SECONDS: Joi.number().integer().min(3).default(15),
  MATCHING_AGE_BAND_SIZE: Joi.number().integer().min(1).default(5),
  MATCHING_SPEEDUP_PRICE_DIAMOND: Joi.number().integer().min(1).default(50),
  MATCHING_SPEEDUP_MAX_PER_HOUR: Joi.number().integer().min(1).default(3),
  MATCHING_PRIORITY_BOOST_MS: Joi.number().integer().min(0).default(300_000),

  THROTTLE_TTL_SECONDS: Joi.number().integer().min(1).default(60),
  THROTTLE_LIMIT: Joi.number().integer().min(1).default(100),
});

export const validateCoreApiEnv = createConfigValidator(coreApiEnvSchema);
