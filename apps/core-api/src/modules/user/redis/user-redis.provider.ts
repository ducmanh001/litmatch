import { ConfigService } from '@nestjs/config';
import { createCoreRedisClient } from '../../../common/redis/core-redis-client';

import type { CoreApiEnv } from '../../../config/env.validation';

/** Redis client cho presence read và các state ephemeral do signaling ghi. */
export const USER_REDIS = 'USER_REDIS';

export const userRedisProvider = {
  provide: USER_REDIS,
  inject: [ConfigService],
  useFactory: (config: ConfigService<CoreApiEnv, true>) =>
    createCoreRedisClient(config.getOrThrow('REDIS_URL', { infer: true })),
};
