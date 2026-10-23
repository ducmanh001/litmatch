import { parseRealtimeRedisUrls } from '@litmatch/common-dtos';

import { createCoreRedisClient } from '../redis/core-redis-client';
import { RedisRealtimePublisher } from './redis-realtime-publisher.adapter';
import { ShardedRealtimePublisher } from './sharded-realtime-publisher.adapter';

import type { ConfigService } from '@nestjs/config';
import type { CoreApiEnv } from '../../config/env.validation';
import type { RealtimePublisherPort } from './realtime-publisher.port';

/**
 * Publisher realtime của một module. Không đặt `REALTIME_REDIS_URLS` → đúng một shard là
 * `REDIS_URL` (hành vi như trước khi có shard); đặt danh sách → mỗi user publish vào shard riêng
 * của họ. Các shard dùng chung client theo URL trong process (xem `createCoreRedisClient`).
 */
export function createRealtimePublisher(
  config: ConfigService<CoreApiEnv, true>,
): RealtimePublisherPort {
  const urls = parseRealtimeRedisUrls(
    config.get('REALTIME_REDIS_URLS', { infer: true }),
    config.getOrThrow('REDIS_URL', { infer: true }),
  );
  const shards = urls.map(
    (url) => new RedisRealtimePublisher(createCoreRedisClient(url)),
  );
  return shards.length === 1 ? shards[0] : new ShardedRealtimePublisher(shards);
}
