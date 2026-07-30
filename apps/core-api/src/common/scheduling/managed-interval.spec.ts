import { SchedulerRegistry } from '@nestjs/schedule';

import { ManagedInterval } from './managed-interval';

import type { DataSource, QueryRunner } from 'typeorm';

describe('ManagedInterval', () => {
  afterEach(() => jest.useRealTimers());

  it('registers and removes its named interval', () => {
    const scheduler = new SchedulerRegistry();
    const job = new ManagedInterval();

    job.start(scheduler, {
      jobName: 'test-job',
      intervalMs: 1_000,
      task: async () => undefined,
      logger: { error: jest.fn() },
      errorMessage: 'tick failed',
    });

    expect(scheduler.doesExist('interval', 'test-job')).toBe(true);
    job.stop();
    expect(scheduler.doesExist('interval', 'test-job')).toBe(false);
  });

  it('logs rejected timer callbacks without leaking the rejection', async () => {
    jest.useFakeTimers();
    const scheduler = new SchedulerRegistry();
    const logger = { error: jest.fn() };
    const job = new ManagedInterval();
    job.start(scheduler, {
      jobName: 'failing-job',
      intervalMs: 10,
      task: async () => {
        throw new Error('boom');
      },
      logger,
      errorMessage: 'tick failed',
    });

    await jest.advanceTimersByTimeAsync(10);

    expect(logger.error).toHaveBeenCalledWith(
      { err: 'Error: boom' },
      'tick failed',
    );
    job.stop();
  });

  it('skips overlap and releases the guard after success or failure', async () => {
    const job = new ManagedInterval();
    let release!: () => void;
    const first = job.runExclusive(
      () =>
        new Promise<number>((resolve) => {
          release = () => resolve(7);
        }),
      0,
    );

    await expect(job.runExclusive(async () => 9, 0)).resolves.toBe(0);
    release();
    await expect(first).resolves.toBe(7);

    await expect(
      job.runExclusive(async () => Promise.reject(new Error('failed')), 0),
    ).rejects.toThrow('failed');
    await expect(job.runExclusive(async () => 11, 0)).resolves.toBe(11);
  });

  it('does not overlap slow scheduled callbacks', async () => {
    jest.useFakeTimers();
    const scheduler = new SchedulerRegistry();
    const job = new ManagedInterval();
    let release!: () => void;
    const task = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );

    job.start(scheduler, {
      jobName: 'slow-job',
      intervalMs: 10,
      task,
      logger: { error: jest.fn() },
      errorMessage: 'tick failed',
    });

    await jest.advanceTimersByTimeAsync(30);
    expect(task).toHaveBeenCalledTimes(1);
    release();
    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(10);
    expect(task).toHaveBeenCalledTimes(2);
    job.stop();
  });

  it('runs a cluster singleton only on the advisory-lock winner', async () => {
    jest.useFakeTimers();
    const scheduler = new SchedulerRegistry();
    const task = jest.fn(async () => undefined);
    const winner = stubClusterDataSource(true);
    const follower = stubClusterDataSource(false);
    const winnerJob = new ManagedInterval();
    const followerJob = new ManagedInterval();

    for (const [job, dataSource] of [
      [winnerJob, winner.dataSource],
      [followerJob, follower.dataSource],
    ] as const) {
      job.start(scheduler, {
        jobName:
          dataSource === winner.dataSource ? 'winner-job' : 'follower-job',
        intervalMs: 1_000,
        task,
        logger: { error: jest.fn() },
        errorMessage: 'tick failed',
        clusterSingleton: { dataSource },
      });
    }

    await jest.advanceTimersByTimeAsync(1_000);

    expect(task).toHaveBeenCalledTimes(1);
    expect(winner.runner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(follower.runner.rollbackTransaction).toHaveBeenCalledTimes(1);
    winnerJob.stop();
    followerJob.stop();
  });

  it('backs off a cluster follower instead of claiming on every short tick', async () => {
    jest.useFakeTimers();
    const scheduler = new SchedulerRegistry();
    const { dataSource } = stubClusterDataSource(false);
    const job = new ManagedInterval();

    job.start(scheduler, {
      jobName: 'follower-backoff',
      intervalMs: 1_000,
      task: async () => undefined,
      logger: { error: jest.fn() },
      errorMessage: 'tick failed',
      clusterSingleton: { dataSource },
    });

    await jest.advanceTimersByTimeAsync(4_000);
    expect(dataSource.createQueryRunner).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(2_000);
    expect(dataSource.createQueryRunner).toHaveBeenCalledTimes(2);
    job.stop();
  });
});

function stubClusterDataSource(acquired: boolean): {
  dataSource: DataSource;
  runner: jest.Mocked<QueryRunner>;
} {
  const runner = {
    connect: jest.fn(async () => undefined),
    startTransaction: jest.fn(async () => undefined),
    query: jest.fn(async () => [{ acquired }]),
    commitTransaction: jest.fn(async () => undefined),
    rollbackTransaction: jest.fn(async () => undefined),
    release: jest.fn(async () => undefined),
    isTransactionActive: true,
  } as unknown as jest.Mocked<QueryRunner>;
  const dataSource = {
    createQueryRunner: jest.fn(() => runner),
  } as unknown as DataSource;
  return { dataSource, runner };
}
