import { ConfigService } from '@nestjs/config';
import { parseRealtimeRedisUrls } from '@litmatch/common-dtos';
import { createCoreRedisClient } from '../../../common/redis/core-redis-client';
import { RedisPresenceReader } from './redis-presence-reader.adapter';

import type { CoreApiEnv } from '../../../config/env.validation';

/** Capability token for reading derived presence written by the signaling lease adapter. */
export const USER_REDIS = 'USER_REDIS';

export const userRedisProvider = {
  provide: USER_REDIS,
  inject: [ConfigService],
  useFactory: (config: ConfigService<CoreApiEnv, true>) =>
    new RedisPresenceReader(
      parseRealtimeRedisUrls(
        config.get('REALTIME_REDIS_URLS', { infer: true }),
        config.getOrThrow('REDIS_URL', { infer: true }),
      ).map((url) => createCoreRedisClient(url)),
    ),
};
