import { ConfigService } from '@nestjs/config';
import { createRealtimePublisher } from '../../../common/realtime/realtime-publisher.factory';

import type { Provider } from '@nestjs/common';
import type { CoreApiEnv } from '../../../config/env.validation';

/** Publisher realtime riêng của Party Room — chỉ để publish realtime party.* (docs/05 § 5.3). */
export const PARTY_REDIS = Symbol('PARTY_REDIS');

export const partyRedisProvider: Provider = {
  provide: PARTY_REDIS,
  inject: [ConfigService],
  useFactory: (config: ConfigService<CoreApiEnv, true>) =>
    createRealtimePublisher(config),
};
