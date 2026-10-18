import 'reflect-metadata';

import { realtimeShardIndex, realtimeUserChannel } from '@litmatch/common-dtos';

import { ShardedRealtimePublisher } from './sharded-realtime-publisher.adapter';

import type { RealtimePublisherPort } from './realtime-publisher.port';

function fakeShards(count: number): Array<
  RealtimePublisherPort & {
    publish: jest.Mock;
    close: jest.Mock;
  }
> {
  return Array.from({ length: count }, () => ({
    publish: jest.fn(async () => 1),
    close: jest.fn(async () => undefined),
  }));
}

describe('ShardedRealtimePublisher', () => {
  it('publish vào đúng shard của người nhận — cùng hàm hash với signaling-gateway', async () => {
    const shards = fakeShards(4);
    const publisher = new ShardedRealtimePublisher(shards);
    const userIds = ['user-1', 'user-2', 'user-3', 'user-4', 'user-5'];

    for (const userId of userIds) {
      await publisher.publish(realtimeUserChannel(userId), `payload-${userId}`);
    }

    for (const userId of userIds) {
      const expected = realtimeShardIndex(userId, 4);
      expect(shards[expected].publish).toHaveBeenCalledWith(
        realtimeUserChannel(userId),
        `payload-${userId}`,
      );
      const hits = shards.filter((shard) =>
        shard.publish.mock.calls.some(
          ([channel]) => channel === realtimeUserChannel(userId),
        ),
      );
      expect(hits).toHaveLength(1); // không bao giờ nhân bản sang shard khác
    }
  });

  it('channel không có userId đi shard 0 thay vì ném lỗi', async () => {
    const shards = fakeShards(3);
    const publisher = new ShardedRealtimePublisher(shards);

    await publisher.publish('khac:channel', 'x');

    expect(shards[0].publish).toHaveBeenCalledWith('khac:channel', 'x');
  });

  it('lỗi publish của shard được trả nguyên cho publishRealtimeEvent xử lý best-effort', async () => {
    const shards = fakeShards(2);
    const publisher = new ShardedRealtimePublisher(shards);
    const userId = 'user-1';
    shards[realtimeShardIndex(userId, 2)].publish.mockRejectedValueOnce(
      new Error('redis down'),
    );

    await expect(
      publisher.publish(realtimeUserChannel(userId), 'x'),
    ).rejects.toThrow('redis down');
  });

  it('close() đóng mọi shard kể cả khi một shard đóng lỗi', async () => {
    const shards = fakeShards(3);
    shards[1].close.mockRejectedValueOnce(new Error('already closed'));
    const publisher = new ShardedRealtimePublisher(shards);

    await expect(publisher.close()).resolves.toBeUndefined();

    for (const shard of shards) expect(shard.close).toHaveBeenCalledTimes(1);
  });

  it('từ chối cấu hình không có shard nào', () => {
    expect(() => new ShardedRealtimePublisher([])).toThrow('ít nhất một shard');
  });
});
