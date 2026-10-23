import { ConfigService } from '@nestjs/config';
import { createRealtimePublisher } from '../../../common/realtime/realtime-publisher.factory';

import type { Provider } from '@nestjs/common';
import type { CoreApiEnv } from '../../../config/env.validation';

/** Publisher realtime riêng của Gift — chỉ để publish realtime `gift.sent` (docs/05 § 5.3). */
export const GIFT_REDIS = Symbol('GIFT_REDIS');

export const giftRedisProvider: Provider = {
  provide: GIFT_REDIS,
  inject: [ConfigService],
  useFactory: (config: ConfigService<CoreApiEnv, true>) =>
    createRealtimePublisher(config),
};
