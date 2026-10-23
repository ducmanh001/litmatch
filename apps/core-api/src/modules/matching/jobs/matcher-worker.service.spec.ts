import { MatcherWorkerService } from './matcher-worker.service';
import { GenderPreference } from '../entities/match-ticket.entity';
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

describe('MatcherWorkerService — wake-up khi tick đang chạy, cache cặp không ghép được', () => {
  function makeWorker2(overrides: {
    listActiveShards?: jest.Mock;
    canPair?: jest.Mock;
    unpairableCacheMs?: number;
  }) {
    const config = {
      getOrThrow: (key: string) => {
        if (key === 'MATCHING_MATCHER_CONCURRENCY') return 2;
        if (key === 'MATCHING_MATCHER_UNPAIRABLE_CACHE_MS')
          return overrides.unpairableCacheMs ?? 30_000;
        if (key === 'DATABASE_POOL_MAX') return 10;
        throw new Error(`unexpected config ${key}`);
      },
    } as never;
    const queue = {
      listActiveShards: overrides.listActiveShards ?? jest.fn(async () => []),
    };
    const policy = { canPair: overrides.canPair ?? jest.fn(async () => true) };
    const worker = new MatcherWorkerService(
      undefined as never,
      config,
      undefined as never,
      queue as never,
      undefined as never,
      policy as never,
      undefined as never,
      undefined as never,
      new MatcherWakeup(),
    );
    return { worker, queue, policy };
  }

  const settle = async (): Promise<void> => {
    for (let index = 0; index < 10; index += 1) await Promise.resolve();
  };

  it('wake-up đến giữa lúc tick đang chạy → tick đó chạy lại ngay khi xong (không bỏ)', async () => {
    let finishFirstRound!: () => void;
    const listActiveShards = jest
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<string[]>(
            (resolve) => (finishFirstRound = () => resolve([])),
          ),
      )
      .mockResolvedValue([]);
    const { worker } = makeWorker2({ listActiveShards });

    const first = worker.runOnce();
    await settle();
    expect(await worker.runOnce()).toBe(0); // tick khác đang chạy → chỉ đặt cờ
    expect(listActiveShards).toHaveBeenCalledTimes(1);
    finishFirstRound();
    await first;

    expect(listActiveShards).toHaveBeenCalledTimes(2);
  });

  it('không có wake-up nào trong lúc chạy thì chỉ chạy một vòng', async () => {
    const listActiveShards = jest.fn(async () => [] as string[]);
    const { worker } = makeWorker2({ listActiveShards });

    await worker.runOnce();

    expect(listActiveShards).toHaveBeenCalledTimes(1);
  });

  it('backlog liên tục: chỉ chạy lại tối đa 4 vòng liên tiếp rồi nhường', async () => {
    const holder: { worker?: MatcherWorkerService } = {};
    const listActiveShards = jest.fn(async () => {
      void holder.worker?.runOnce(); // luôn có wake-up mới trong lúc đang chạy
      return [] as string[];
    });
    holder.worker = makeWorker2({ listActiveShards }).worker;

    await holder.worker.runOnce();

    expect(listActiveShards).toHaveBeenCalledTimes(4);
  });

  describe('findPair', () => {
    type Ticket = { userId: string; genderPreference: GenderPreference };
    const ticket = (userId: string): Ticket => ({
      userId,
      genderPreference: GenderPreference.Any,
    });
    const run = (
      worker: MatcherWorkerService,
      tickets: Ticket[],
    ): Promise<Ticket[] | undefined> =>
      (
        worker as unknown as {
          findPair(
            candidates: Ticket[],
            users: Map<string, { gender: string }>,
          ): Promise<Ticket[] | undefined>;
        }
      ).findPair(
        tickets,
        new Map(tickets.map((t) => [t.userId, { gender: 'unknown' }])),
      );

    it('cặp bị block được nhớ: lần sau không hỏi canPair lại và quét sang cặp kế tiếp', async () => {
      const canPair = jest.fn(
        async (a: string, b: string) => !(a === 'u1' && b === 'u2'),
      );
      const { worker } = makeWorker2({ canPair });
      const tickets = [ticket('u1'), ticket('u2'), ticket('u3')];

      expect((await run(worker, tickets))?.map((t) => t.userId)).toEqual([
        'u1',
        'u3',
      ]);
      expect(canPair).toHaveBeenCalledTimes(2); // (u1,u2) bị chặn, (u1,u3) ghép được

      canPair.mockClear();
      expect((await run(worker, tickets))?.map((t) => t.userId)).toEqual([
        'u1',
        'u3',
      ]);
      expect(canPair).toHaveBeenCalledTimes(1); // (u1,u2) đã nhớ → bỏ qua, chỉ kiểm (u1,u3)
    });

    it('trần 4 lần kiểm chưa-cache mỗi cửa sổ; các cặp đã kiểm được nhớ nên lần sau đi sâu hơn', async () => {
      const canPair = jest.fn(async (a: string, b: string) => b === 'u7');
      const { worker } = makeWorker2({ canPair });
      const tickets = ['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7'].map(ticket);

      expect(await run(worker, tickets)).toBeUndefined();
      expect(canPair).toHaveBeenCalledTimes(4);

      // Vòng sau: 4 cặp đầu đã nhớ nên không tốn lượt, quét tới cặp có u7.
      canPair.mockClear();
      const found = await run(worker, tickets);
      expect(found?.map((t) => t.userId)).toEqual(['u1', 'u7']);
      expect(canPair.mock.calls.length).toBeLessThanOrEqual(4);
    });

    it('MATCHING_MATCHER_UNPAIRABLE_CACHE_MS=0 tắt cache: luôn hỏi canPair lại', async () => {
      const canPair = jest.fn(async () => false);
      const { worker } = makeWorker2({ canPair, unpairableCacheMs: 0 });
      const tickets = [ticket('u1'), ticket('u2')];

      await run(worker, tickets);
      await run(worker, tickets);

      expect(canPair).toHaveBeenCalledTimes(2);
    });

    it('kết luận "không ghép được" hết hạn sau 30 giây (vd người dùng bỏ chặn)', async () => {
      jest.useFakeTimers();
      try {
        const canPair = jest
          .fn()
          .mockResolvedValueOnce(false)
          .mockResolvedValue(true);
        const { worker } = makeWorker2({ canPair });
        const tickets = [ticket('u1'), ticket('u2')];

        expect(await run(worker, tickets)).toBeUndefined();
        expect(await run(worker, tickets)).toBeUndefined(); // còn trong cache, không hỏi lại
        expect(canPair).toHaveBeenCalledTimes(1);

        jest.advanceTimersByTime(30_001);
        expect(await run(worker, tickets)).toBeDefined();
        expect(canPair).toHaveBeenCalledTimes(2);
      } finally {
        jest.useRealTimers();
      }
    });
  });
});
