import { SchedulerRegistry } from '@nestjs/schedule';

import { ConcurrencyBudget } from './concurrency-budget';
import { ManagedInterval } from './managed-interval';

import type { DataSource } from 'typeorm';

function deferred() {
  let resolve!: () => void;
  const ready = new Promise<void>((done) => (resolve = done));
  return { ready, resolve };
}

function database(poolSize: number) {
  const state = { active: 0, peak: 0, claims: 0, releases: 0 };
  const dataSource = {
    options: { poolSize },
    createQueryRunner: () => {
      state.claims++;
      return {
        connect: async () => {
          state.active++;
          state.peak = Math.max(state.peak, state.active);
        },
        startTransaction: async () => undefined,
        query: async () => [{ acquired: true }],
        commitTransaction: async () => undefined,
        rollbackTransaction: async () => undefined,
        release: async () => {
          state.active--;
          state.releases++;
        },
        isTransactionActive: true,
      };
    },
  } as unknown as DataSource;
  return { dataSource, state };
}

describe('scheduled database admission', () => {
  let scheduler: SchedulerRegistry;
  let jobs: ManagedInterval[];

  beforeEach(() => {
    jest.useFakeTimers();
    scheduler = new SchedulerRegistry();
    jobs = [];
  });

  afterEach(() => {
    for (const job of jobs) job.stop();
    jest.useRealTimers();
  });

  function start(
    name: string,
    dataSource: DataSource,
    task: () => Promise<unknown>,
    extra: { priority?: 'critical'; budget?: ConcurrencyBudget } = {},
  ) {
    const job = new ManagedInterval();
    jobs.push(job);
    job.start(scheduler, {
      jobName: name,
      intervalMs: 1_000,
      task,
      logger: { error: jest.fn() },
      errorMessage: 'test failure',
      clusterSingleton: { dataSource, ...extra },
    });
    return job;
  }

  it.each([
    [5, 1],
    [10, 2],
  ])(
    'pool %i admits %i regular jobs, queues once and serves FIFO',
    async (pool, slots) => {
      const { dataSource, state } = database(pool);
      const gates = Array.from({ length: 7 }, deferred);
      const started: number[] = [];
      gates.forEach((gate, index) => {
        start(`regular-${index}`, dataSource, async () => {
          started.push(index);
          await gate.ready;
        });
      });
      await jest.advanceTimersByTimeAsync(10_000);
      expect(started).toEqual(
        Array.from({ length: slots }, (_, index) => index),
      );
      expect(state.claims).toBe(slots);
      for (let index = 0; index < gates.length; index++) {
        gates[index].resolve();
        await jest.advanceTimersByTimeAsync(0);
        expect(started).toEqual(
          Array.from(
            { length: Math.min(index + slots + 1, gates.length) },
            (_, i) => i,
          ),
        );
      }
      expect(state.peak).toBe(slots);
      expect(state.releases).toBe(gates.length);
    },
  );

  it('serves a critical timer and another datasource while background work stalls', async () => {
    const first = database(5);
    const second = database(5);
    const slow = deferred();
    const queued = jest.fn(async () => undefined);
    const critical = jest.fn(async () => undefined);
    const isolated = jest.fn(async () => undefined);
    start('slow-cleanup', first.dataSource, () => slow.ready);
    start('queued-cleanup', first.dataSource, queued);
    start('calling-timer', first.dataSource, critical, {
      priority: 'critical',
    });
    start('other-database', second.dataSource, isolated);
    await jest.advanceTimersByTimeAsync(1_000);
    expect(queued).not.toHaveBeenCalled();
    expect(critical).toHaveBeenCalledTimes(1);
    expect(isolated).toHaveBeenCalledTimes(1);
    expect(first.state.peak).toBe(2);
    slow.resolve();
    await jest.advanceTimersByTimeAsync(0);
    expect(queued).toHaveBeenCalledTimes(1);
  });

  it('cancels stopped queued work without taking its retention budget or a connection', async () => {
    const { dataSource, state } = database(5);
    const slow = deferred();
    const budget = new ConcurrencyBudget(1);
    const acquire = jest.spyOn(budget, 'tryAcquire');
    const task = jest.fn(async () => undefined);
    start('active', dataSource, () => slow.ready);
    const pending = start('stopped', dataSource, task, { budget });
    await jest.advanceTimersByTimeAsync(5_000);
    expect(state.claims).toBe(1);
    expect(acquire).not.toHaveBeenCalled();
    pending.stop();
    slow.resolve();
    await jest.advanceTimersByTimeAsync(0);
    expect(task).not.toHaveBeenCalled();
    expect(acquire).not.toHaveBeenCalled();
    expect(budget.inUse).toBe(0);
    expect(state.claims).toBe(1);
    expect(state.releases).toBe(1);
  });

  it('releases admission after task failure and a denied retention budget', async () => {
    const { dataSource, state } = database(5);
    const budget = new ConcurrencyBudget(1);
    const releaseBudget = budget.tryAcquire();
    const denied = jest.fn(async () => undefined);
    const last = jest.fn(async () => undefined);
    start('failure', dataSource, async () => {
      throw new Error('task failed');
    });
    start('denied', dataSource, denied, { budget });
    start('after-failure', dataSource, last);
    await jest.advanceTimersByTimeAsync(1_000);
    expect(denied).not.toHaveBeenCalled();
    expect(last).toHaveBeenCalledTimes(1);
    expect(state.claims).toBe(2);
    expect(state.releases).toBe(2);
    expect(state.active).toBe(0);
    releaseBudget?.();
  });
});
