import { ConcurrencyBudget } from './concurrency-budget';
import { ManagedInterval } from './managed-interval';

import type { SchedulerRegistry } from '@nestjs/schedule';
import type { DataSource } from 'typeorm';

describe('ConcurrencyBudget', () => {
  it('cấp tối đa `limit` chỗ rồi từ chối ngay (không chờ); nhả xong thì cấp lại', () => {
    const budget = new ConcurrencyBudget(2);
    const a = budget.tryAcquire();
    const b = budget.tryAcquire();
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(budget.tryAcquire()).toBeUndefined();
    expect(budget.inUse).toBe(2);

    a?.();
    expect(budget.tryAcquire()).toBeDefined();
  });

  it('nhả hai lần không làm âm bộ đếm (không cấp lố chỗ)', () => {
    const budget = new ConcurrencyBudget(1);
    const release = budget.tryAcquire();
    release?.();
    release?.();
    expect(budget.inUse).toBe(0);
    expect(budget.tryAcquire()).toBeDefined();
    expect(budget.tryAcquire()).toBeUndefined();
  });

  it('từ chối limit không hợp lệ', () => {
    expect(() => new ConcurrencyBudget(0)).toThrow();
    expect(() => new ConcurrencyBudget(1.5)).toThrow();
  });
});

describe('ManagedInterval với ngân sách đồng thời', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const scheduler = {
    addInterval: jest.fn(),
    doesExist: () => false,
    deleteInterval: jest.fn(),
  } as unknown as SchedulerRegistry;

  function dataSourceWith(counter: { runners: number }): DataSource {
    return {
      createQueryRunner: () => {
        counter.runners += 1;
        return {
          connect: async () => undefined,
          startTransaction: async () => undefined,
          query: async () => [{ acquired: true }],
          commitTransaction: async () => undefined,
          rollbackTransaction: async () => undefined,
          release: async () => undefined,
          isTransactionActive: false,
        };
      },
    } as unknown as DataSource;
  }

  it('hết ngân sách thì BỎ tick TRƯỚC khi lấy kết nối pool (không tạo query runner); nhả xong chạy lại bình thường', async () => {
    const budget = new ConcurrencyBudget(1);
    const counter = { runners: 0 };
    const task = jest.fn(async () => undefined);
    const job = new ManagedInterval();
    job.start(scheduler, {
      jobName: 'budgeted',
      intervalMs: 1_000,
      task,
      logger: { error: jest.fn() },
      errorMessage: 'lỗi',
      clusterSingleton: { dataSource: dataSourceWith(counter), budget },
    });

    const held = budget.tryAcquire() as () => void; // một job khác đang chiếm chỗ duy nhất
    await jest.advanceTimersByTimeAsync(1_000);
    expect(counter.runners).toBe(0);
    expect(task).not.toHaveBeenCalled();

    held();
    await jest.advanceTimersByTimeAsync(1_000);
    expect(counter.runners).toBe(1);
    expect(task).toHaveBeenCalledTimes(1);
    expect(budget.inUse).toBe(0); // nhả cả khi chạy xong

    job.stop();
  });

  it('task ném lỗi vẫn nhả ngân sách', async () => {
    const budget = new ConcurrencyBudget(1);
    const counter = { runners: 0 };
    const job = new ManagedInterval();
    job.start(scheduler, {
      jobName: 'budgeted-error',
      intervalMs: 1_000,
      task: async () => {
        throw new Error('boom');
      },
      logger: { error: jest.fn() },
      errorMessage: 'lỗi',
      clusterSingleton: { dataSource: dataSourceWith(counter), budget },
    });
    await jest.advanceTimersByTimeAsync(1_000);
    expect(budget.inUse).toBe(0);
    job.stop();
  });
});
