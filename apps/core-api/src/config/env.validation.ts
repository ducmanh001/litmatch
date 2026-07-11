import { baseEnvSchema, createConfigValidator } from '@litmatch/config-validator';
import * as Joi from 'joi';

/**
 * Toàn bộ env key của core-api — không hardcode giá trị nghiệp vụ trong code (docs/05 § 5.1).
 * Naming: UPPER_SNAKE có prefix domain (docs/05 § 5.6).
 */
export const coreApiEnvSchema = Joi.object({
  ...baseEnvSchema,
  PORT: Joi.number().port().default(3000),
  CORS_ORIGINS: Joi.string().allow('').default(''),
  SWAGGER_ENABLED: Joi.boolean().default(true),

  DATABASE_URL: Joi.string().uri({ scheme: ['postgres', 'postgresql'] }).required(),
  REDIS_URL: Joi.string().uri({ scheme: ['redis'] }).default('redis://localhost:6379'),
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
  ECONOMY_OUTBOX_RELAY_INTERVAL_MS: Joi.number().integer().min(200).default(2000),
  ECONOMY_RECONCILIATION_ENABLED: Joi.boolean().default(true),
  ECONOMY_RECONCILIATION_INTERVAL_MS: Joi.number().integer().min(10_000).default(300_000),

  // Refund/chargeback (docs/services/economy-service.md § 5)
  // Mặc định 'store' (fail-closed) — thiếu config thì getOrThrow() chết ngay lúc verify thay vì
  // âm thầm chấp nhận webhook giả mạo nếu ai đó quên set biến này ở production (docs/10 § Economy).
  ECONOMY_APPLE_WEBHOOK_VERIFIER: Joi.string().valid('dev', 'store').default('store'),
  ECONOMY_APPLE_ROOT_CA_PEM: Joi.string().allow('').default(''),
  ECONOMY_GOOGLE_RTDN_VERIFIER: Joi.string().valid('dev', 'store').default('store'),
  ECONOMY_GOOGLE_RTDN_AUDIENCE: Joi.string().allow('').default(''),
  ECONOMY_GOOGLE_RTDN_SERVICE_ACCOUNT_EMAIL: Joi.string().allow('').default(''),
  ECONOMY_APPLE_ISSUER_ID: Joi.string().allow('').default(''),
  ECONOMY_APPLE_KEY_ID: Joi.string().allow('').default(''),
  ECONOMY_APPLE_PRIVATE_KEY: Joi.string().allow('').default(''),
  ECONOMY_APPLE_BUNDLE_ID: Joi.string().allow('').default(''),
  ECONOMY_APPLE_SERVER_API_ENV: Joi.string().valid('sandbox', 'production').default('sandbox'),
  ECONOMY_REFUND_POLL_ENABLED: Joi.boolean().default(false),
  ECONOMY_REFUND_POLL_INTERVAL_MS: Joi.number().integer().min(60_000).default(3_600_000),
  ECONOMY_REFUND_POLL_WINDOW_DAYS: Joi.number().integer().min(1).default(60),

  THROTTLE_TTL_SECONDS: Joi.number().integer().min(1).default(60),
  THROTTLE_LIMIT: Joi.number().integer().min(1).default(100),
});

export const validateCoreApiEnv = createConfigValidator(coreApiEnvSchema);
