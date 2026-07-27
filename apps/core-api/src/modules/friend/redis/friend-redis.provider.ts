import { ConfigService } from '@nestjs/config';
import { createCoreRedisClient } from '../../../common/redis/core-redis-client';

import type { Provider } from '@nestjs/common';
import type { CoreApiEnv } from '../../../config/env.validation';

/** Client ioredis riêng của Friend — chỉ để publish realtime `friend.message` (docs/05 § 5.3). */
export const FRIEND_REDIS = Symbol('FRIEND_REDIS');

export const friendRedisProvider: Provider = {
  provide: FRIEND_REDIS,
  inject: [ConfigService],
  useFactory: (config: ConfigService<CoreApiEnv, true>) =>
    createCoreRedisClient(config.getOrThrow('REDIS_URL', { infer: true })),
};
