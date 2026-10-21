import { ShardedMatchingQueue } from './sharded-matching-queue.adapter';
import type { MatchingQueuePort } from '../ports/matching-queue.port';

function shard(): jest.Mocked<MatchingQueuePort> {
  return {
    enqueue: jest.fn().mockResolvedValue(undefined),
    remove: jest.fn().mockResolvedValue(undefined),
    peekWindow: jest.fn().mockResolvedValue([
      ['a', '10'],
      ['b', '20'],
    ]),
    claimPair: jest.fn().mockResolvedValue(true),
    listActiveShards: jest.fn().mockResolvedValue([]),
    markActive: jest.fn().mockResolvedValue(undefined),
    unmarkActive: jest.fn().mockResolvedValue(undefined),
    hasEntries: jest.fn().mockResolvedValue(true),
    close: jest.fn().mockResolvedValue(undefined),
  };
}

/** Discover ownership through the public port, without duplicating its hashing algorithm. */
async function keysByOwner(
  queue: ShardedMatchingQueue,
  shards: jest.Mocked<MatchingQueuePort>[],
) {
  const keys: string[] = [];
  for (let i = 0; i < 64 && keys.filter(Boolean).length < shards.length; i++) {
    const key = `matching:queue:soul:region-${i}:4`;
    await queue.enqueue(key, '10', `ticket-${i}`, 'NX');
    const owner = shards.findIndex((item) =>
      item.enqueue.mock.calls.some(([routedKey]) => routedKey === key),
    );
    keys[owner] ??= key;
  }
  expect(keys.filter(Boolean)).toHaveLength(shards.length);
  return keys;
}

describe('ShardedMatchingQueue', () => {
  it.each(['matching:queue:soul:VN:4', 'matching:queue:voice:TH:5'])(
    'keeps enqueue, pair claim, reads, active membership and removal on one owner for %s',
    async (key) => {
      const shards = [shard(), shard(), shard()];
      const queue = new ShardedMatchingQueue(shards);
      await queue.enqueue(key, '10', 'a', 'NX');
      const owner = shards.find(
        (item) => item.enqueue.mock.calls.length === 1,
      )!;

      expect(await queue.peekWindow(key, 2)).toEqual([
        ['a', '10'],
        ['b', '20'],
      ]);
      expect(await queue.claimPair(key, 'a', 'b')).toBe(true);
      await queue.markActive(key);
      expect(await queue.hasEntries(key)).toBe(true);
      await queue.unmarkActive(key);
      await queue.remove(key, 'a');

      expect(owner.claimPair).toHaveBeenCalledWith(key, 'a', 'b');
      expect(owner.markActive).toHaveBeenCalledWith(key);
      expect(owner.unmarkActive).toHaveBeenCalledWith(key);
      expect(owner.remove).toHaveBeenCalledWith(key, 'a');
      for (const other of shards.filter((item) => item !== owner)) {
        for (const method of Object.values(other))
          expect(method).not.toHaveBeenCalled();
      }
    },
  );

  it('continues listing and serving healthy queues when one physical shard is unavailable', async () => {
    const shards = [shard(), shard()];
    const queue = new ShardedMatchingQueue(shards);
    const [healthyKey, failedKey] = await keysByOwner(queue, shards);
    shards[0].listActiveShards.mockResolvedValue([
      healthyKey,
      healthyKey,
      failedKey,
    ]);
    shards[1].listActiveShards.mockRejectedValue(
      new Error('Redis unavailable'),
    );
    shards[1].enqueue.mockRejectedValue(new Error('Redis unavailable'));

    expect(await queue.listActiveShards()).toEqual([healthyKey]);
    await expect(
      queue.enqueue(failedKey, '10', 'failed', 'NX'),
    ).rejects.toThrow('Redis unavailable');
    await expect(
      queue.enqueue(healthyKey, '10', 'healthy', 'NX'),
    ).resolves.toBeUndefined();
    expect(await queue.claimPair(healthyKey, 'a', 'b')).toBe(true);
  });

  it('reports total unavailability instead of an empty healthy queue', async () => {
    const shards = [shard(), shard()];
    for (const item of shards)
      item.listActiveShards.mockRejectedValue(new Error('offline'));
    await expect(
      new ShardedMatchingQueue(shards).listActiveShards(),
    ).rejects.toThrow('All Matching Redis shards are unavailable');
  });
});
