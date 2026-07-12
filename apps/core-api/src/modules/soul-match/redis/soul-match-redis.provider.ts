import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

import type { Provider } from '@nestjs/common';
import type { CoreApiEnv } from '../../../config/env.validation';

/** Client ioredis riêng của Soul Match — chỉ để publish realtime event (không dùng chung connection). */
export const SOUL_MATCH_REDIS = Symbol('SOUL_MATCH_REDIS');

export const soulMatchRedisProvider: Provider = {
  provide: SOUL_MATCH_REDIS,
  inject: [ConfigService],
  useFactory: (config: ConfigService<CoreApiEnv, true>): Redis =>
    new Redis(config.getOrThrow('REDIS_URL', { infer: true })),
};
