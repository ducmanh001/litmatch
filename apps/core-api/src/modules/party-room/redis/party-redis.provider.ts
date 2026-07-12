import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

import type { Provider } from '@nestjs/common';
import type { CoreApiEnv } from '../../../config/env.validation';

/** Client ioredis riêng của Party Room — chỉ để publish realtime party.* (docs/05 § 5.3). */
export const PARTY_REDIS = Symbol('PARTY_REDIS');

export const partyRedisProvider: Provider = {
  provide: PARTY_REDIS,
  inject: [ConfigService],
  useFactory: (config: ConfigService<CoreApiEnv, true>): Redis =>
    new Redis(config.getOrThrow('REDIS_URL', { infer: true })),
};
