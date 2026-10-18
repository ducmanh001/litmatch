import { ConfigService } from '@nestjs/config';
import { createRealtimePublisher } from '../../../common/realtime/realtime-publisher.factory';

import type { Provider } from '@nestjs/common';
import type { CoreApiEnv } from '../../../config/env.validation';

/** Publisher realtime riêng của Soul Match — chỉ để publish realtime event (không dùng chung connection). */
export const SOUL_MATCH_REDIS = Symbol('SOUL_MATCH_REDIS');

export const soulMatchRedisProvider: Provider = {
  provide: SOUL_MATCH_REDIS,
  inject: [ConfigService],
  useFactory: (config: ConfigService<CoreApiEnv, true>) =>
    createRealtimePublisher(config),
};
