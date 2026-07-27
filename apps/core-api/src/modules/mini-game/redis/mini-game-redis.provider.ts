import { ConfigService } from '@nestjs/config';
import { createCoreRedisClient } from '../../../common/redis/core-redis-client';

import type { Provider } from '@nestjs/common';
import type { CoreApiEnv } from '../../../config/env.validation';

/** Client ioredis riêng của Mini Game — chỉ để publish realtime `minigame.*` (docs/05 § 5.3). */
export const MINI_GAME_REDIS = Symbol('MINI_GAME_REDIS');

export const miniGameRedisProvider: Provider = {
  provide: MINI_GAME_REDIS,
  inject: [ConfigService],
  useFactory: (config: ConfigService<CoreApiEnv, true>) =>
    createCoreRedisClient(config.getOrThrow('REDIS_URL', { infer: true })),
};
