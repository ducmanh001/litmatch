import { ConfigService } from '@nestjs/config';
import { createRealtimePublisher } from '../../../common/realtime/realtime-publisher.factory';

import type { Provider } from '@nestjs/common';
import type { CoreApiEnv } from '../../../config/env.validation';

/** Publisher realtime riêng của Calling — chỉ để publish realtime `call.ended` (docs/05 § 5.3). */
export const CALLING_REDIS = Symbol('CALLING_REDIS');

export const callingRedisProvider: Provider = {
  provide: CALLING_REDIS,
  inject: [ConfigService],
  useFactory: (config: ConfigService<CoreApiEnv, true>) =>
    createRealtimePublisher(config),
};
