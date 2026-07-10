import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

import { MatchingQueueStore } from './matching-queue.script';
import { MatchType } from '../entities/match-ticket.entity';

/** Unit test thuần cho parsing Lua script + shard key — hành vi race thật nằm ở integration test. */
describe('MatchingQueueStore', () => {
  const evalFn = jest.fn();
  const config = {
    getOrThrow: jest.fn((key: string) =>
      ({
        MATCHING_REDIS_NAMESPACE: 'matching:test',
        MATCHING_AGE_BAND_SIZE: 5,
        MATCHING_QUEUE_LEASE_MS: 10_000,
        MATCHING_PRIORITY_BOOST_MS: 300_000,
      })[key],
    ),
  } as unknown as ConfigService;
  const redis = {
    eval: evalFn,
    call: jest.fn(),
    zadd: jest.fn(),
    zrem: jest.fn(),
    sadd: jest.fn(),
  } as unknown as Redis;
  const store = new MatchingQueueStore(redis, config);

  beforeEach(() => jest.clearAllMocks());

  it('ageBand làm tròn xuống theo MATCHING_AGE_BAND_SIZE', () => {
    expect(store.ageBand(23)).toBe(20);
    expect(store.ageBand(25)).toBe(25);
    expect(store.ageBand(19)).toBe(15);
  });

  it('shardKey ghép đúng (matchType, region, ageBand) — không có chiều gender (docs/03 § 3.8.B)', () => {
    expect(store.shardKey(MatchType.Voice, 'SEA', 20)).toBe('matching:test:queue:{voice:SEA:20}:ready');
  });

  it('claimBatch parse đúng mảng phẳng và gắn lease owner', async () => {
    evalFn.mockResolvedValue(['t1', '100', 't2', '200']);
    const members = await store.claimBatch('shard-key', 20, 'worker-1');
    expect(members).toEqual([
      { ticketId: 't1', score: 100, leaseOwner: 'worker-1' },
      { ticketId: 't2', score: 200, leaseOwner: 'worker-1' },
    ]);
    expect(evalFn).toHaveBeenCalledWith(
      expect.stringContaining('ZRANGEBYSCORE'),
      4,
      'shard-key',
      'shard-key:leases',
      'shard-key:lease-owner',
      'shard-key:lease-score',
      20,
      expect.any(Number),
      'worker-1',
      expect.any(Number),
    );
  });

  it('claimBatch trả mảng rỗng khi shard trống', async () => {
    evalFn.mockResolvedValue([]);
    await expect(store.claimBatch('empty-shard', 20, 'worker-1')).resolves.toEqual([]);
  });
});
