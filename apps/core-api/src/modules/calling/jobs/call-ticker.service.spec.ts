import { CallTickerService } from './call-ticker.service';
import type { CallingService } from '../calling.service';
import {
  CallEndReason,
  CallSessionStatus,
} from '../entities/call-session.entity';

function fixture(overrides: Record<string, number> = {}) {
  const values: Record<string, number> = {
    CALLING_TICK_BUDGET_MS: 1000,
    CALLING_CLEANUP_CONCURRENCY: 2,
    DATABASE_POOL_MAX: 10,
    CALLING_PENDING_TIMEOUT_SECONDS: 60,
    CALLING_RECONNECT_WINDOW_SECONDS: 30,
    CALLING_FREE_CALL_SECONDS: 420,
    CALLING_JOB_LEASE_MS: 30_000,
    ...overrides,
  };
  const query = {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
  };
  const claimUntil = '2026-10-20 00:00:30.123456+00';
  const candidates = jest.fn(async (stage: string) => {
    const rows =
      stage === 'pending'
        ? [{ id: 'pending-1' }, { id: 'pending-2' }]
        : stage === 'reconnecting'
          ? [{ id: 'reconnecting' }]
          : stage === 'free'
            ? [{ id: 'free-call' }]
            : Array.from({ length: 5 }, (_, i) => ({
                id: `cleanup-${i}`,
                endReason: CallEndReason.Completed,
              }));
    return rows.map((row) => ({ ...row, claimUntil }));
  });
  const repo = {
    createQueryBuilder: jest.fn(),
  };
  repo.createQueryBuilder.mockImplementation(() => {
    let stage = 'free';
    const builder = {
      ...query,
      setLock: jest.fn().mockReturnThis(),
      setOnLocked: jest.fn().mockReturnThis(),
      setFindOptions: jest.fn(
        (value: { where: { status: CallSessionStatus } }) => {
          stage =
            value.where.status === CallSessionStatus.Pending
              ? 'pending'
              : value.where.status === CallSessionStatus.Active
                ? 'reconnecting'
                : 'cleanup';
          return builder;
        },
      ),
      getQueryAndParameters: jest.fn(() => [
        `SELECT '${stage}' AS fixture_stage`,
        [],
      ]),
    };
    return builder;
  });
  const releaseUnused = jest.fn(
    async (_sql: string, _parameters: unknown[]) => [],
  );
  const claimQuery = jest.fn(async (sql: string, parameters: unknown[]) => {
    if (sql.startsWith('UPDATE call_sessions c'))
      return releaseUnused(sql, parameters);
    const stage = /SELECT '(\w+)' AS fixture_stage/.exec(sql)?.[1];
    if (!stage) throw new Error('Missing atomic candidate claim in fixture');
    return candidates(stage);
  });
  const calling = {
    endById: jest.fn<
      ReturnType<CallingService['endById']>,
      Parameters<CallingService['endById']>
    >(async () => ({ call: null, justEnded: false })),
  };
  const ticker = new CallTickerService(
    {
      getRepository: () => repo,
      query: claimQuery,
    } as never,
    { getOrThrow: (key: string) => values[key] } as never,
    {} as never,
    calling as never,
  );
  return { ticker, candidates, calling, releaseUnused, claimQuery, claimUntil };
}

describe('CallTickerService workload isolation', () => {
  afterEach(() => jest.restoreAllMocks());

  it('deadline stops a pending backlog and the next tick reaches reconnect/free stages first', async () => {
    let now = 1000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    const { ticker, calling, releaseUnused, claimUntil } = fixture();
    calling.endById.mockImplementation(async (_id, reason) => {
      if (reason === CallEndReason.PendingTimeout) now += 1001;
      return { call: null, justEnded: false };
    });
    await ticker.runOnce();
    expect(calling.endById.mock.calls.map(([id]) => id)).toEqual(['pending-1']);
    expect(releaseUnused.mock.calls[0][0]).toContain('timer_claim_until');
    expect(JSON.parse(String(releaseUnused.mock.calls[0][1][0]))).toEqual([
      { id: 'pending-1', claimUntil },
      { id: 'pending-2', claimUntil },
    ]);
    await ticker.runOnce();
    expect(calling.endById.mock.calls.map(([id]) => id)).toEqual([
      'pending-1',
      'reconnecting',
      'free-call',
      'pending-1',
    ]);
    for (const args of calling.endById.mock.calls)
      expect(args[3]).toEqual({ deferCleanup: true, skipLocked: true });
  });

  it('a stalled cleanup does not block the independent server timer', async () => {
    const { ticker, calling } = fixture();
    let started!: () => void, release!: () => void;
    const active = new Promise<void>((resolve) => {
      started = resolve;
    });
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    calling.endById.mockImplementation(async (id) => {
      if (id.startsWith('cleanup-')) {
        started();
        await blocked;
      }
      return { call: null, justEnded: false };
    });
    const cleaning = ticker.runCleanupOnce();
    await active;
    try {
      await ticker.runOnce();
      expect(
        calling.endById.mock.calls.some(([id]) => id === 'free-call'),
      ).toBe(true);
    } finally {
      release();
      await cleaning;
    }
  });

  it('cleanup bounds concurrency and starts no further work after the deadline', async () => {
    let now = 1000,
      running = 0,
      peak = 0,
      entered = 0;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    const { ticker, calling, releaseUnused, claimUntil } = fixture();
    let bothStarted!: () => void, release!: () => void;
    const active = new Promise<void>((resolve) => {
      bothStarted = resolve;
    });
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    calling.endById.mockImplementation(async () => {
      running++;
      peak = Math.max(peak, running);
      if (++entered === 2) bothStarted();
      await blocked;
      running--;
      return { call: null, justEnded: false };
    });
    const cleaning = ticker.runCleanupOnce();
    await active;
    now += 1001;
    release();
    await cleaning;
    expect(peak).toBe(2);
    expect(calling.endById).toHaveBeenCalledTimes(2);
    expect(releaseUnused.mock.calls[0][0]).toContain('cleanup_claim_until');
    expect(JSON.parse(String(releaseUnused.mock.calls[0][1][0]))).toEqual([
      { id: 'cleanup-0', claimUntil },
      { id: 'cleanup-1', claimUntil },
      { id: 'cleanup-2', claimUntil },
      { id: 'cleanup-3', claimUntil },
      { id: 'cleanup-4', claimUntil },
    ]);
  });

  it.each(['pending', 'reconnecting'])(
    '%s failure releases the claimed batch using the exact lease timestamp',
    async (failedStage) => {
      const { ticker, candidates, calling, releaseUnused, claimUntil } =
        fixture();
      const select = candidates.getMockImplementation()!;
      candidates.mockImplementation(async (stage) => {
        if (stage !== failedStage) return select(stage);
        return [1, 2].map((n) => ({ id: `${stage}-${n}`, claimUntil }));
      });
      calling.endById.mockImplementation(async (id) => {
        if (id === `${failedStage}-1`) throw new Error('temporary DB failure');
        return { call: null, justEnded: false };
      });

      await expect(ticker.runOnce()).rejects.toThrow('temporary DB failure');

      expect(releaseUnused).toHaveBeenCalledTimes(
        failedStage === 'pending' ? 1 : 2,
      );
      const [sql, parameters] =
        releaseUnused.mock.calls[releaseUnused.mock.calls.length - 1];
      expect(JSON.parse(String(parameters[0]))).toEqual([
        { id: `${failedStage}-1`, claimUntil },
        { id: `${failedStage}-2`, claimUntil },
      ]);
      // Compare against the original microsecond timestamp, so stale cleanup cannot clear a new claim.
      expect(sql).toContain('c.timer_claim_until = unused."claimUntil"');
    },
  );

  it('small pools reserve capacity and one cleanup failure does not stop the others', async () => {
    const { ticker, calling } = fixture({
      DATABASE_POOL_MAX: 5,
      CALLING_CLEANUP_CONCURRENCY: 10,
    });
    let running = 0,
      peak = 0;
    calling.endById.mockImplementation(async (id) => {
      running++;
      peak = Math.max(peak, running);
      await Promise.resolve();
      running--;
      if (id === 'cleanup-0') throw new Error('temporary DB failure');
      return { call: null, justEnded: false };
    });
    await ticker.runCleanupOnce();
    expect(peak).toBe(1);
    expect(calling.endById).toHaveBeenCalledTimes(5);
  });

  it('shutdown stops scheduling further cleanup and timer work', async () => {
    const { ticker, calling, candidates } = fixture();
    ticker.onApplicationShutdown();
    await ticker.runCleanupOnce();
    await ticker.runOnce();
    expect(candidates).not.toHaveBeenCalled();
    expect(calling.endById).not.toHaveBeenCalled();
  });

  it('a slow candidate SELECT still attempts one timer item, with rotation on the next tick', async () => {
    let now = 1000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    const { ticker, candidates, calling } = fixture();
    const find = candidates.getMockImplementation();
    if (!find) throw new Error('Missing candidate query fixture');
    candidates.mockImplementation(async (options) => {
      const rows = await find(options);
      now += 1001;
      return rows;
    });
    await ticker.runOnce();
    await ticker.runOnce();
    expect(calling.endById.mock.calls.map(([id]) => id)).toEqual([
      'pending-1',
      'reconnecting',
    ]);
  });

  it('a slow cleanup SELECT allows one task total across workers after the deadline', async () => {
    let now = 1000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    const { ticker, candidates, calling } = fixture();
    const find = candidates.getMockImplementation();
    if (!find) throw new Error('Missing candidate query fixture');
    candidates.mockImplementation(async (options) => {
      const rows = await find(options);
      now += 1001;
      return rows;
    });
    await ticker.runCleanupOnce();
    expect(calling.endById).toHaveBeenCalledTimes(1);
    expect(calling.endById.mock.calls[0][0]).toBe('cleanup-0');
  });

  it('backs off an entirely failing cleanup batch without blocking the timer', async () => {
    let now = 1000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    const { ticker, candidates, calling } = fixture();
    calling.endById.mockImplementation(async (id) => {
      if (id.startsWith('cleanup-')) throw new Error('dependency unavailable');
      return { call: null, justEnded: false };
    });
    await ticker.runCleanupOnce();
    expect(candidates).toHaveBeenCalledTimes(1);
    await ticker.runCleanupOnce();
    expect(candidates).toHaveBeenCalledTimes(1);
    await ticker.runOnce();
    expect(calling.endById.mock.calls.some(([id]) => id === 'free-call')).toBe(
      true,
    );
    const beforeRetry = candidates.mock.calls.length;
    now += 5001;
    await ticker.runCleanupOnce();
    expect(candidates).toHaveBeenCalledTimes(beforeRetry + 1);
  });
});
