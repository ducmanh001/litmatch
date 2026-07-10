import { baseEnvSchema, createConfigValidator } from '@litmatch/config-validator';
import * as Joi from 'joi';

export const signalingEnvSchema = Joi.object({
  ...baseEnvSchema,
  SIGNALING_PORT: Joi.number().port().default(3001),
  CORS_ORIGINS: Joi.string().allow('').default(''),
});

export const validateSignalingEnv = createConfigValidator(signalingEnvSchema);
