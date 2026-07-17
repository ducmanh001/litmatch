import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

import type { Provider } from '@nestjs/common';
import type { CoreApiEnv } from '../../../config/env.validation';

/** Client ioredis riêng của module Discovery (không dùng chung connection với module khác). */
export const DISCOVERY_REDIS = Symbol('DISCOVERY_REDIS');

/** Counter rate-limit ghi vị trí theo user — chống spam cập nhật lộ trình di chuyển. */
export function locationUpdateCountKey(userId: string): string {
  return `discovery:location-update:count:${userId}`;
}

/** Counter rate-limit truy vấn nearby theo user — chống dò quét trilateration bằng nhiều truy vấn. */
export function nearbyQueryCountKey(userId: string): string {
  return `discovery:nearby-query:count:${userId}`;
}

export const discoveryRedisProvider: Provider = {
  provide: DISCOVERY_REDIS,
  inject: [ConfigService],
  useFactory: (config: ConfigService<CoreApiEnv, true>): Redis =>
    new Redis(config.getOrThrow('REDIS_URL', { infer: true })),
};
