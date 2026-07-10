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

  ECONOMY_IAP_VERIFIER: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().valid('store').required(),
    otherwise: Joi.string().valid('dev', 'store').default('dev'),
  }),
  ECONOMY_APPLE_SHARED_SECRET: Joi.when('ECONOMY_IAP_VERIFIER', {
    is: 'store',
    then: Joi.string().min(1).required(),
    otherwise: Joi.string().allow('').default(''),
  }),
  ECONOMY_GOOGLE_PACKAGE_NAME: Joi.when('ECONOMY_IAP_VERIFIER', {
    is: 'store',
    then: Joi.string().min(1).required(),
    otherwise: Joi.string().allow('').default(''),
  }),
  ECONOMY_GOOGLE_SA_EMAIL: Joi.when('ECONOMY_IAP_VERIFIER', {
    is: 'store',
    then: Joi.string().email().required(),
    otherwise: Joi.string().allow('').default(''),
  }),
  ECONOMY_GOOGLE_SA_PRIVATE_KEY: Joi.when('ECONOMY_IAP_VERIFIER', {
    is: 'store',
    then: Joi.string().min(1).required(),
    otherwise: Joi.string().allow('').default(''),
  }),
  ECONOMY_OUTBOX_RELAY_ENABLED: Joi.boolean().default(false),
  ECONOMY_OUTBOX_RELAY_INTERVAL_MS: Joi.number().integer().min(200).default(2000),
  ECONOMY_RECONCILIATION_ENABLED: Joi.boolean().default(true),
  ECONOMY_RECONCILIATION_INTERVAL_MS: Joi.number().integer().min(10_000).default(300_000),

  // Refund/chargeback (docs/services/economy-service.md § 5)
  // Production bắt buộc store verifier + credential ngay lúc bootstrap; local/test mới
  // được default dev. Không để misconfiguration đợi tới request webhook đầu tiên mới nổ.
  ECONOMY_APPLE_WEBHOOK_VERIFIER: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().valid('store').required(),
    otherwise: Joi.string().valid('dev', 'store').default('dev'),
  }),
  ECONOMY_APPLE_ROOT_CA_PEM: Joi.when('ECONOMY_APPLE_WEBHOOK_VERIFIER', {
    is: 'store',
    then: Joi.string().min(1).required(),
    otherwise: Joi.string().allow('').default(''),
  }),
  ECONOMY_GOOGLE_RTDN_VERIFIER: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().valid('store').required(),
    otherwise: Joi.string().valid('dev', 'store').default('dev'),
  }),
  ECONOMY_GOOGLE_RTDN_AUDIENCE: Joi.when('ECONOMY_GOOGLE_RTDN_VERIFIER', {
    is: 'store',
    then: Joi.string().uri().required(),
    otherwise: Joi.string().allow('').default(''),
  }),
  ECONOMY_GOOGLE_RTDN_SERVICE_ACCOUNT_EMAIL: Joi.when('ECONOMY_GOOGLE_RTDN_VERIFIER', {
    is: 'store',
    then: Joi.string().email().required(),
    otherwise: Joi.string().allow('').default(''),
  }),
  ECONOMY_APPLE_ISSUER_ID: Joi.string().allow('').default(''),
  ECONOMY_APPLE_KEY_ID: Joi.string().allow('').default(''),
  ECONOMY_APPLE_PRIVATE_KEY: Joi.string().allow('').default(''),
  ECONOMY_APPLE_BUNDLE_ID: Joi.when('ECONOMY_APPLE_WEBHOOK_VERIFIER', {
    is: 'store',
    then: Joi.string().min(1).required(),
    otherwise: Joi.string().allow('').default(''),
  }),
  ECONOMY_APPLE_SERVER_API_ENV: Joi.string().valid('sandbox', 'production').default('sandbox'),
  ECONOMY_REFUND_POLL_ENABLED: Joi.boolean().default(false),
  ECONOMY_REFUND_POLL_INTERVAL_MS: Joi.number().integer().min(60_000).default(3_600_000),
  ECONOMY_REFUND_POLL_WINDOW_DAYS: Joi.number().integer().min(1).default(60),

  THROTTLE_TTL_SECONDS: Joi.number().integer().min(1).default(60),
  THROTTLE_LIMIT: Joi.number().integer().min(1).default(100),

  // Matching (Giai đoạn 2 M1 — docs/03 § 3.8.B)
  MATCHING_MATCHER_INTERVAL_MS: Joi.number().integer().min(50).default(300),
  MATCHING_MATCHER_BATCH_SIZE: Joi.number().integer().min(2).default(20),
  MATCHING_SWEEPER_INTERVAL_MS: Joi.number().integer().min(500).default(5000),
  MATCHING_QUEUE_MAX_WAIT_SECONDS: Joi.number().integer().min(5).default(120),
  MATCHING_CONFIRM_TIMEOUT_SECONDS: Joi.number().integer().min(3).default(15),
  MATCHING_AGE_BAND_SIZE: Joi.number().integer().min(1).default(5),
  MATCHING_SPEEDUP_PRICE_DIAMOND: Joi.number().integer().min(1).default(50),
  MATCHING_SPEEDUP_MAX_PER_HOUR: Joi.number().integer().min(1).default(3),
  MATCHING_PRIORITY_BOOST_MS: Joi.number().integer().min(0).default(300_000),
  MATCHING_QUEUE_LEASE_MS: Joi.number().integer().min(1000).default(10_000),
  MATCHING_QUEUE_OUTBOX_BATCH_SIZE: Joi.number().integer().min(1).max(500).default(100),
  MATCHING_REDIS_NAMESPACE: Joi.string().pattern(/^[A-Za-z0-9:_-]+$/).default('matching'),
  MATCHING_GUEST_DAILY_TICKET_LIMIT: Joi.number().integer().min(1).default(3),

  // R-007 Safety foundation: persistent per-reporter limit (controller throttle is only the outer shield).
  SAFETY_REPORT_MAX_PER_HOUR: Joi.number().integer().min(1).max(100).default(5),
});

export const validateCoreApiEnv = createConfigValidator(coreApiEnvSchema);
