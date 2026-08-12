import { MatcherWorkerService } from './matcher-worker.service';
import { MatcherWakeup } from '../matcher-wakeup';

import type { SchedulerRegistry } from '@nestjs/schedule';

describe('MatcherWorkerService wake-up scheduling', () => {
  beforeEach(() => jest.useFakeTimers());

  afterEach(() => jest.useRealTimers());

  function makeWorker() {
    let interval: NodeJS.Timeout | undefined;
    const scheduler = {
      addInterval: (_name: string, value: NodeJS.Timeout) => {
        interval = value;
      },
      doesExist: () => interval !== undefined,
      deleteInterval: () => {
        if (interval) clearInterval(interval);
        interval = undefined;
      },
    } as unknown as SchedulerRegistry;
    const config = {
      getOrThrow: (key: string) => {
        if (key === 'MATCHING_MATCHER_INTERVAL_MS') return 10_000;
        if (key === 'MATCHING_MATCHER_BATCH_SIZE') return 20;
        throw new Error(`unexpected config ${key}`);
      },
    } as never;
    const wakeup = new MatcherWakeup();
    const worker = new MatcherWorkerService(
      undefined as never,
      config,
      scheduler,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      wakeup,
    );
    return { worker, wakeup };
  }

  it('debounces multiple enqueue signals into one matcher batch', () => {
    const { worker, wakeup } = makeWorker();
    const runOnce = jest.spyOn(worker, 'runOnce').mockResolvedValue(0);

    worker.onApplicationBootstrap();
    wakeup.notify();
    wakeup.notify();
    wakeup.notify();

    jest.advanceTimersByTime(49);
    expect(runOnce).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(runOnce).toHaveBeenCalledTimes(1);

    worker.onApplicationShutdown();
  });

  it('does not schedule a new run after shutdown', () => {
    const { worker, wakeup } = makeWorker();
    const runOnce = jest.spyOn(worker, 'runOnce').mockResolvedValue(0);

    worker.onApplicationBootstrap();
    worker.onApplicationShutdown();
    wakeup.notify();
    jest.advanceTimersByTime(50);

    expect(runOnce).not.toHaveBeenCalled();
  });

  it('forces a batch after the maximum wake delay during continuous signals', () => {
    const { worker, wakeup } = makeWorker();
    const runOnce = jest.spyOn(worker, 'runOnce').mockResolvedValue(0);

    worker.onApplicationBootstrap();
    wakeup.notify();
    jest.advanceTimersByTime(40);
    wakeup.notify();
    jest.advanceTimersByTime(40);
    wakeup.notify();
    jest.advanceTimersByTime(40);
    wakeup.notify();
    jest.advanceTimersByTime(40);
    wakeup.notify();
    jest.advanceTimersByTime(40);
    wakeup.notify();
    jest.advanceTimersByTime(49);

    expect(runOnce).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(runOnce).toHaveBeenCalledTimes(1);

    worker.onApplicationShutdown();
  });

  it('limits sustained wake-ups after the first fast batch', () => {
    const { worker, wakeup } = makeWorker();
    const runOnce = jest.spyOn(worker, 'runOnce').mockResolvedValue(0);

    worker.onApplicationBootstrap();
    wakeup.notify();
    jest.advanceTimersByTime(50);
    expect(runOnce).toHaveBeenCalledTimes(1);

    wakeup.notify();
    jest.advanceTimersByTime(999);
    expect(runOnce).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1);
    expect(runOnce).toHaveBeenCalledTimes(2);

    worker.onApplicationShutdown();
  });
});
