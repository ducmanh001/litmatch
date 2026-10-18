import {
  parseRealtimeUserChannel,
  realtimeShardIndex,
} from '@litmatch/common-dtos';

import type { RealtimePublisherPort } from './realtime-publisher.port';

/**
 * Publish realtime lên đúng shard Redis của người nhận (`REALTIME_REDIS_URLS`): shard chọn theo
 * userId lấy từ tên channel `realtime:user:{userId}`, cùng hàm `realtimeShardIndex` mà
 * signaling-gateway dùng để subscribe — hai app không thể lệch nhau vì dùng chung một định nghĩa.
 * Channel không đúng format (không có userId) đi shard 0; gateway không subscribe channel đó.
 */
export class ShardedRealtimePublisher implements RealtimePublisherPort {
  constructor(private readonly shards: readonly RealtimePublisherPort[]) {
    if (shards.length === 0) {
      throw new Error('ShardedRealtimePublisher cần ít nhất một shard');
    }
  }

  publish(channel: string, payload: string): Promise<unknown> {
    const userId = parseRealtimeUserChannel(channel);
    const shard = userId ? realtimeShardIndex(userId, this.shards.length) : 0;
    return this.shards[shard].publish(channel, payload);
  }

  async close(): Promise<void> {
    await Promise.allSettled(this.shards.map((shard) => shard.close?.()));
  }
}
