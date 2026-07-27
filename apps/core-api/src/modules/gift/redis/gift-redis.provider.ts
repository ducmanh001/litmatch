import { ConfigService } from '@nestjs/config';
import { createCoreRedisClient } from '../../../common/redis/core-redis-client';

import type { Provider } from '@nestjs/common';
import type { CoreApiEnv } from '../../../config/env.validation';

/** Client ioredis riêng của Gift — chỉ để publish realtime `gift.sent` (docs/05 § 5.3). */
export const GIFT_REDIS = Symbol('GIFT_REDIS');

export const giftRedisProvider: Provider = {
  provide: GIFT_REDIS,
  inject: [ConfigService],
  useFactory: (config: ConfigService<CoreApiEnv, true>) =>
    createCoreRedisClient(config.getOrThrow('REDIS_URL', { infer: true })),
};
