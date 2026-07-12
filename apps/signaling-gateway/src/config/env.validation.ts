import {
  baseEnvSchema,
  createConfigValidator,
} from '@litmatch/config-validator';
import * as Joi from 'joi';

/**
 * Khớp 1-1 với `signalingEnvSchema` bên dưới — type param cho `ConfigService<SignalingEnv, true>`
 * (docs/05 § 5.2, cùng convention `CoreApiEnv` của core-api: sửa key ở schema thì sửa luôn ở đây).
 */
export interface SignalingEnv {
  NODE_ENV: 'development' | 'test' | 'production';
  LOG_LEVEL: 'trace' | 'debug' | 'info' | 'warn' | 'error';
  SIGNALING_PORT: number;
  CORS_ORIGINS: string;
}

export const signalingEnvSchema = Joi.object({
  ...baseEnvSchema,
  SIGNALING_PORT: Joi.number().port().default(3001),
  CORS_ORIGINS: Joi.string().allow('').default(''),
});

export const validateSignalingEnv = createConfigValidator(signalingEnvSchema);
