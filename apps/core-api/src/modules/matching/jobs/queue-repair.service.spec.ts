import {
  MatchTicket,
  MatchTicketStatus,
  MatchType,
} from '../entities/match-ticket.entity';
import { QueueRepairService } from './queue-repair.service';
import type { MatchingQueuePort } from '../ports/matching-queue.port';

function ticket(id: string, region = 'VN', priorityBoostMs = 100): MatchTicket {
  return Object.assign(new MatchTicket(), {
    id,
    region,
    matchType: MatchType.Soul,
    ageBand: 4,
    status: MatchTicketStatus.Queued,
    enqueuedAt: new Date(10_000),
    trustPenaltyMs: 500,
    priorityBoostMs,
  });
}

function fixture(pages: MatchTicket[][], batchSize = 2) {
  let state: { at: string; id: string } | null = null;
  let page: MatchTicket[] = [];
  const at = '2026-10-20 00:00:00.123456+00';
  const find = jest.fn(async () => page);
  const query = jest.fn(async (sql: string, parameters: unknown[]) => {
    if (sql.startsWith('SELECT state')) return [{ state }];
    if (sql.startsWith('SELECT id')) {
      page = pages.shift() ?? [];
      return page.map(({ id }) => ({ id, at }));
    }
    state = JSON.parse(String(parameters[1])) as typeof state;
    return [];
  });
  const dataSource = { query, manager: { find } };
  const queue: jest.Mocked<MatchingQueuePort> = {
    enqueue: jest.fn().mockResolvedValue(undefined),
    remove: jest.fn().mockResolvedValue(undefined),
    peekWindow: jest.fn().mockResolvedValue([]),
    claimPair: jest.fn().mockResolvedValue(false),
    listActiveShards: jest.fn().mockResolvedValue([]),
    markActive: jest.fn().mockResolvedValue(undefined),
    unmarkActive: jest.fn().mockResolvedValue(undefined),
    hasEntries: jest.fn().mockResolvedValue(false),
    close: jest.fn().mockResolvedValue(undefined),
  };
  const notify = jest.fn();
  const values: Record<string, number> = {
    MATCHING_QUEUE_REPAIR_BATCH_SIZE: batchSize,
    MATCHING_QUEUE_MAX_WAIT_SECONDS: 300,
  };
  const createService = () =>
    new QueueRepairService(
      dataSource as never,
      { getOrThrow: (key: string) => values[key] } as never,
      {} as never,
      queue,
      { notify } as never,
    );
  return { createService, queue, query, find, notify, at, state: () => state };
}

describe('QueueRepairService', () => {
  it('continues the persisted cursor after a worker replacement and resets after a short page', async () => {
    const first = ticket('a'),
      second = ticket('b'),
      third = ticket('c');
    const { createService, query, state, at } = fixture([
      [first, second],
      [third],
    ]);

    expect(await createService().runOnce()).toBe(2);
    expect(state()).toEqual({ id: second.id, at });
    expect(await createService().runOnce()).toBe(1);

    const candidateReads = query.mock.calls.filter(([sql]) =>
      sql.startsWith('SELECT id'),
    );
    expect(candidateReads[0][1]).toEqual([300, 2]);
    expect(candidateReads[1][1]).toEqual([300, 2, at, second.id]);
    expect(state()).toBeNull();
  });

  it('recovers healthy tickets during a shard failure and revisits failed tickets in the next cycle', async () => {
    const failed = ticket('failed', 'VN'),
      healthy = ticket('healthy', 'TH');
    const { createService, queue, state, notify } = fixture([
      [failed, healthy],
      [],
      [failed, healthy],
    ]);
    queue.enqueue.mockImplementationOnce(async () => {
      throw new Error('shard offline');
    });
    const service = createService();

    expect(await service.runOnce()).toBe(1);
    expect(state()?.id).toBe(healthy.id);
    expect(queue.markActive).toHaveBeenCalledWith('matching:queue:soul:TH:4');
    expect(await service.runOnce()).toBe(0);
    expect(state()).toBeNull();
    expect(await service.runOnce()).toBe(2);

    expect(
      queue.enqueue.mock.calls.filter(
        ([, , id, mode]) => id === failed.id && mode === 'NX',
      ),
    ).toHaveLength(2);
    expect(notify).toHaveBeenCalledTimes(2);
  });

  it('inserts with NX then refreshes the DB boost monotonically without overwriting a newer Redis boost', async () => {
    const old = ticket('boosted'),
      fresh = ticket('boosted', 'VN', 800);
    const { createService, queue, find } = fixture([[old]]);
    find.mockResolvedValueOnce([old]).mockResolvedValueOnce([fresh]);
    let redisScore = 9_600; // A newer paid boost already reached Redis before this repair.
    queue.enqueue.mockImplementation(async (_key, score, _id, mode) => {
      if (mode === 'XX_LT') redisScore = Math.min(redisScore, Number(score));
      else if (mode !== 'NX') redisScore = Number(score);
    });

    expect(await createService().runOnce()).toBe(1);

    expect(queue.enqueue.mock.calls).toEqual([
      ['matching:queue:soul:VN:4', '10400', old.id, 'NX'],
      ['matching:queue:soul:VN:4', '9700', old.id, 'XX_LT'],
    ]);
    expect(redisScore).toBe(9_600);
  });

  it('removes a ticket that leaves queued state during the repair instead of marking it active', async () => {
    const item = ticket('cancelled');
    const { createService, queue, find, notify } = fixture([[item]]);
    find.mockResolvedValueOnce([item]).mockResolvedValueOnce([]);

    expect(await createService().runOnce()).toBe(0);

    expect(queue.remove).toHaveBeenCalledWith(
      'matching:queue:soul:VN:4',
      item.id,
    );
    expect(queue.markActive).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });
});
