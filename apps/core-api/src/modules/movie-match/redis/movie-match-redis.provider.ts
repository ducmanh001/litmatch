import { ConfigService } from '@nestjs/config';
import { createCoreRedisClient } from '../../../common/redis/core-redis-client';

import type { Provider } from '@nestjs/common';
import type { CoreApiEnv } from '../../../config/env.validation';

/** Client ioredis riêng của Movie Match — chỉ để publish realtime `movie.*` (docs/05 § 5.3). */
export const MOVIE_MATCH_REDIS = Symbol('MOVIE_MATCH_REDIS');

export const movieMatchRedisProvider: Provider = {
  provide: MOVIE_MATCH_REDIS,
  inject: [ConfigService],
  useFactory: (config: ConfigService<CoreApiEnv, true>) =>
    createCoreRedisClient(config.getOrThrow('REDIS_URL', { infer: true })),
};
