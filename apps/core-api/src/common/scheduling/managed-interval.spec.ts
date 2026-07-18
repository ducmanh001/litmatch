import { SchedulerRegistry } from '@nestjs/schedule';

import { ManagedInterval } from './managed-interval';

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
});
