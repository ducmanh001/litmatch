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

  THROTTLE_TTL_SECONDS: Joi.number().integer().min(1).default(60),
  THROTTLE_LIMIT: Joi.number().integer().min(1).default(100),
});

export const validateCoreApiEnv = createConfigValidator(coreApiEnvSchema);
