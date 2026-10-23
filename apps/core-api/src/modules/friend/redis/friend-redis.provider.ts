import { ConfigService } from '@nestjs/config';
import { createCoreRedisClient } from '../../../common/redis/core-redis-client';
import { RedisWindowGateAdapter } from '../../../common/redis/redis-window-gate.adapter';
import { createRealtimePublisher } from '../../../common/realtime/realtime-publisher.factory';

import type { Provider } from '@nestjs/common';
import type { WindowGatePort } from '../../../common/redis/window-gate.port';
import type { CoreApiEnv } from '../../../config/env.validation';

/** Publisher realtime riêng của Friend — chỉ để publish realtime `friend.message` (docs/05 § 5.3). */
export const FRIEND_REDIS = Symbol('FRIEND_REDIS');

export const friendRedisProvider: Provider = {
  provide: FRIEND_REDIS,
  inject: [ConfigService],
  useFactory: (config: ConfigService<CoreApiEnv, true>) =>
    createRealtimePublisher(config),
};

/**
 * Cổng gộp thông báo tin nhắn (`FriendMessageNotifier`). Dùng Redis lõi (REDIS_URL), không phải shard
 * realtime: đây là khoá tạm theo (người nhận, hội thoại), không phải pub/sub tới gateway.
 */
export const FRIEND_NOTIFY_GATE = Symbol('FRIEND_NOTIFY_GATE');

export const friendNotifyGateProvider: Provider = {
  provide: FRIEND_NOTIFY_GATE,
  inject: [ConfigService],
  useFactory: (config: ConfigService<CoreApiEnv, true>): WindowGatePort =>
    new RedisWindowGateAdapter(
      createCoreRedisClient(config.getOrThrow('REDIS_URL', { infer: true })),
    ),
};
