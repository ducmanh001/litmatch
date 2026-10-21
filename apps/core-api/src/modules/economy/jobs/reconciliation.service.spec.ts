import type { Meter } from '@opentelemetry/api';

import { EconomyMetrics } from '../economy.metrics';
import { LedgerReconciliationCheckpoint } from './ledger-reconciliation-checkpoint';
import { ReconciliationService } from './reconciliation.service';
import { WalletReconciliationSampler } from './wallet-reconciliation-sampler';

import type { ConfigService } from '@nestjs/config';
import type { SchedulerRegistry } from '@nestjs/schedule';
import type { DataSource } from 'typeorm';

import type { CoreApiEnv } from '../../../config/env.validation';

/** Config stub trả giá trị theo key — giống shape getOrThrow của ConfigService. */
function stubConfig(
  values: Record<string, unknown>,
): ConfigService<CoreApiEnv, true> {
  return {
    getOrThrow: (key: string) => {
      if (!(key in values)) throw new Error(`thiếu key config stub: ${key}`);
      return values[key];
    },
  } as unknown as ConfigService<CoreApiEnv, true>;
}

function stubScheduler() {
  const intervals = new Map<string, NodeJS.Timeout>();
  return {
    intervals,
    scheduler: {
      addInterval: (name: string, interval: NodeJS.Timeout) => {
        intervals.set(name, interval);
      },
      doesExist: (_type: string, name: string) => intervals.has(name),
      deleteInterval: (name: string) => {
        clearInterval(intervals.get(name));
        intervals.delete(name);
      },
    } as unknown as SchedulerRegistry,
  };
}

const ENABLED_CONFIG = {
  ECONOMY_RECONCILIATION_ENABLED: true,
  ECONOMY_RECONCILIATION_INTERVAL_MS: 300_000,
  ECONOMY_RECONCILIATION_FAST_INTERVAL_MS: 60_000,
  ECONOMY_RECONCILIATION_LAG_MS: 300_000,
  ECONOMY_RECONCILIATION_FULL_INTERVAL_MS: 86_400_000,
  ECONOMY_RECONCILIATION_BATCH_SIZE: 1000,
  ECONOMY_RECONCILIATION_MAX_BATCHES_PER_TICK: 4,
  ECONOMY_RECONCILIATION_TICK_BUDGET_MS: 1000,
};

/**
 * Paging belongs to LedgerReconciliationCheckpoint; the service queries orphan receipts and wallet samples.
 */
function stubDataSource(input: {
  imbalances?: Array<{ currency: string; imbalance: string }>;
  orphanCount?: string;
  walletMismatches?: Array<{
    userId: string;
    snapshot: string;
    derived: string;
  }>;
}): DataSource {
  jest
    .mocked(LedgerReconciliationCheckpoint.prototype.advance)
    .mockResolvedValue({
      imbalances: input.imbalances ?? [],
      complete: true,
      completedBefore: '2026-10-19 00:00:00+00',
    });
  const dataSource = {
    query: jest.fn(async (sql: string) => {
      if (sql.includes('iap_receipts'))
        return [{ count: input.orphanCount ?? '0' }];
      throw new Error(`query không nhận diện được trong stub: ${sql}`);
    }),
  } as unknown as DataSource;
  Object.assign(dataSource, {
    transaction: async (callback: (manager: unknown) => Promise<unknown>) =>
      callback({
        query: jest.fn(async (sql: string) => {
          if (sql.startsWith('SELECT state')) {
            return [{ state: { afterUserId: null } }];
          }
          if (sql.includes('AS "sampledWallets"')) {
            return [
              {
                sampledWallets: Math.max(
                  1,
                  input.walletMismatches?.length ?? 0,
                ),
                nextUserId: '00000000-0000-0000-0000-000000000001',
                walletMismatches: input.walletMismatches ?? [],
              },
            ];
          }
          return [];
        }),
      }),
    createQueryRunner: () => ({
      connect: async () => undefined,
      startTransaction: async () => undefined,
      query: async () => [{ acquired: true }],
      commitTransaction: async () => undefined,
      rollbackTransaction: async () => undefined,
      release: async () => undefined,
      isTransactionActive: true,
    }),
  });
  return dataSource;
}

function makeService(
  ds: DataSource,
  config = stubConfig(ENABLED_CONFIG),
  scheduler = stubScheduler().scheduler,
) {
  const mismatchCounter = { add: jest.fn() };
  const gauge = { addCallback: jest.fn() };
  const histogram = { record: jest.fn() };
  const meter = {
    createCounter: jest
      .fn()
      .mockReturnValueOnce({ add: jest.fn() })
      .mockReturnValueOnce(mismatchCounter),
    createObservableGauge: jest.fn(() => gauge),
    createHistogram: jest.fn(() => histogram),
  } as unknown as Meter;
  const metrics = new EconomyMetrics(meter);
  const service = new ReconciliationService(ds, config, scheduler, metrics);
  return {
    service,
    metrics,
    metricState: { mismatchCounter, gauge, histogram },
  };
}

describe('ReconciliationService', () => {
  beforeEach(() => {
    jest
      .spyOn(LedgerReconciliationCheckpoint.prototype, 'advance')
      .mockResolvedValue({
        imbalances: [],
        complete: true,
        completedBefore: '2026-10-19 00:00:00+00',
      });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('lập lịch 2 tier độc lập', () => {
    it('bootstrap đăng ký 2 interval riêng (fast + deep) theo đúng interval config', async () => {
      jest.useFakeTimers();
      const { intervals, scheduler } = stubScheduler();
      const { service } = makeService(
        stubDataSource({}),
        stubConfig(ENABLED_CONFIG),
        scheduler,
      );
      service.onApplicationBootstrap();

      expect([...intervals.keys()].sort()).toEqual([
        'economy-reconciliation-deep',
        'economy-reconciliation-fast',
      ]);

      const fastSpy = jest
        .spyOn(service, 'runFast')
        .mockResolvedValue({ ok: true } as never);
      const deepSpy = jest
        .spyOn(service, 'runDeep')
        .mockResolvedValue({ ok: true } as never);

      // 60s: fast chạy 1 lần, deep chưa tới hạn
      await jest.advanceTimersByTimeAsync(60_000);
      expect(fastSpy).toHaveBeenCalledTimes(1);
      expect(deepSpy).toHaveBeenCalledTimes(0);

      // tới 300s: fast đã chạy 5 lần, deep 1 lần
      await jest.advanceTimersByTimeAsync(240_000);
      expect(fastSpy).toHaveBeenCalledTimes(5);
      expect(deepSpy).toHaveBeenCalledTimes(1);

      service.onApplicationShutdown();
      expect(intervals.size).toBe(0);
    });

    it('ECONOMY_RECONCILIATION_ENABLED=false tắt CẢ HAI tier (giữ hợp đồng flag cũ)', () => {
      const { intervals, scheduler } = stubScheduler();
      const { service } = makeService(
        stubDataSource({}),
        stubConfig({
          ...ENABLED_CONFIG,
          ECONOMY_RECONCILIATION_ENABLED: false,
        }),
        scheduler,
      );
      service.onApplicationBootstrap();
      expect(intervals.size).toBe(0);
      // shutdown khi chưa đăng ký gì cũng không được throw
      expect(() => service.onApplicationShutdown()).not.toThrow();
    });

    it('run theo lịch lỗi (DB down): interval sống tiếp, gauge tier = 0 để alert bắt được', async () => {
      jest.useFakeTimers();
      const failingDs = {
        query: jest.fn(async () => {
          throw new Error('db down');
        }),
        createQueryRunner: () => ({
          connect: async () => undefined,
          startTransaction: async () => undefined,
          query: async () => [{ acquired: true }],
          commitTransaction: async () => undefined,
          rollbackTransaction: async () => undefined,
          release: async () => undefined,
          isTransactionActive: true,
        }),
      } as unknown as DataSource;
      const { scheduler } = stubScheduler();
      const { service, metrics, metricState } = makeService(
        failingDs,
        stubConfig(ENABLED_CONFIG),
        scheduler,
      );
      service.onApplicationBootstrap();

      await jest.advanceTimersByTimeAsync(60_000); // flush cả microtask của promise trong callback

      expect(
        (
          metrics as unknown as {
            reconciliationStatusByTier: Map<string, number>;
          }
        ).reconciliationStatusByTier.get('fast'),
      ).toBe(0);
      // run lỗi giữa chừng KHÔNG ghi duration (tránh nhiễu histogram bởi run dở dang)
      expect(metricState.histogram.record).not.toHaveBeenCalled();
      service.onApplicationShutdown();
    });
  });

  describe('durable reconciliation progress', () => {
    it('passes bounded paging configuration to the checkpoint on every run', async () => {
      const { service } = makeService(stubDataSource({}));
      await service.runFast();
      await service.runFast();
      const advance = jest.mocked(
        LedgerReconciliationCheckpoint.prototype.advance,
      );
      expect(advance).toHaveBeenCalledTimes(2);
      expect(advance).toHaveBeenLastCalledWith({
        lagMs: 300_000,
        fullIntervalMs: 86_400_000,
        batchSize: 1000,
        maxBatches: 4,
        budgetMs: 1000,
      });
    });

    it('does not report an incomplete balanced history as a successful audit', async () => {
      const { service, metrics, metricState } = makeService(stubDataSource({}));
      jest
        .mocked(LedgerReconciliationCheckpoint.prototype.advance)
        .mockResolvedValueOnce({
          imbalances: [],
          complete: false,
          completedBefore: null,
        });
      const report = await service.runFast();
      expect(report).toEqual({
        currencyImbalances: [],
        receiptsWithoutTransaction: 0,
        ok: false,
        complete: false,
        completedBefore: null,
      });
      expect(
        (
          metrics as unknown as {
            reconciliationStatusByTier: Map<string, number>;
          }
        ).reconciliationStatusByTier.get('fast'),
      ).toBe(0);
      expect(metricState.mismatchCounter.add).not.toHaveBeenCalled();
    });

    it('exposes completion watermark only after the checkpoint catches up', async () => {
      const { service } = makeService(stubDataSource({}));
      jest
        .mocked(LedgerReconciliationCheckpoint.prototype.advance)
        .mockResolvedValueOnce({
          imbalances: [],
          complete: false,
          completedBefore: null,
        })
        .mockResolvedValueOnce({
          imbalances: [],
          complete: true,
          completedBefore: '2026-10-20 00:00:00+00',
        });
      expect((await service.runFast()).ok).toBe(false);
      expect(await service.runFast()).toMatchObject({
        ok: true,
        complete: true,
        completedBefore: '2026-10-20 00:00:00+00',
      });
    });

    it('propagates a checkpoint failure and retries on the following run', async () => {
      const ds = stubDataSource({});
      const { service } = makeService(ds);
      jest
        .mocked(LedgerReconciliationCheckpoint.prototype.advance)
        .mockRejectedValueOnce(new Error('db down'));
      await expect(service.runFast()).rejects.toThrow('db down');
      expect(ds.query).not.toHaveBeenCalled();
      expect((await service.runFast()).ok).toBe(true);
    });
  });

  describe('metrics tier fast', () => {
    it('lệch bất biến + orphan receipt: counter theo check/currency, status = 0', async () => {
      const { service, metricState } = makeService(
        stubDataSource({
          imbalances: [
            { currency: 'DIA', imbalance: '7' },
            { currency: 'PTS', imbalance: '-3' },
          ],
          orphanCount: '2',
        }),
      );
      const report = await service.runFast();
      expect(report.ok).toBe(false);

      expect(metricState.mismatchCounter.add).toHaveBeenCalledWith(1, {
        check: 'invariant',
        currency: 'DIA',
      });
      expect(metricState.mismatchCounter.add).toHaveBeenCalledWith(1, {
        check: 'invariant',
        currency: 'PTS',
      });
      expect(metricState.mismatchCounter.add).toHaveBeenCalledWith(2, {
        check: 'orphan_receipt',
        currency: 'DIA',
      });
      expect(metricState.histogram.record).toHaveBeenCalledWith(
        expect.any(Number),
        { tier: 'fast' },
      );
    });

    it('cân sổ: status = 1, không có series mismatch nào', async () => {
      const { service, metrics, metricState } = makeService(stubDataSource({}));
      const report = await service.runFast();
      expect(report.ok).toBe(true);

      expect(
        (
          metrics as unknown as {
            reconciliationStatusByTier: Map<string, number>;
          }
        ).reconciliationStatusByTier.get('fast'),
      ).toBe(1);
      expect(metricState.mismatchCounter.add).not.toHaveBeenCalled();
    });
  });

  describe('metrics tier deep', () => {
    it('snapshot ví lệch ledger: counter wallet_sample, status deep = 0', async () => {
      const { service, metrics, metricState } = makeService(
        stubDataSource({
          walletMismatches: [
            { userId: 'u1', snapshot: '100', derived: '93' },
            { userId: 'u2', snapshot: '5', derived: '0' },
          ],
        }),
      );
      const report = await service.runDeep();
      expect(report.ok).toBe(false);

      expect(metricState.mismatchCounter.add).toHaveBeenCalledWith(2, {
        check: 'wallet_sample',
        currency: 'DIA',
      });
      expect(
        (
          metrics as unknown as {
            reconciliationStatusByTier: Map<string, number>;
          }
        ).reconciliationStatusByTier.get('deep'),
      ).toBe(0);
      expect(metricState.histogram.record).toHaveBeenCalledWith(
        expect.any(Number),
        { tier: 'deep' },
      );
    });

    it('khớp hết: status deep = 1', async () => {
      const { service, metrics } = makeService(stubDataSource({}));
      expect((await service.runDeep()).ok).toBe(true);
      expect(
        (
          metrics as unknown as {
            reconciliationStatusByTier: Map<string, number>;
          }
        ).reconciliationStatusByTier.get('deep'),
      ).toBe(1);
    });
  });

  describe('durable rotating wallet sample', () => {
    const firstId = '00000000-0000-0000-0000-000000000001';
    const secondId = '00000000-0000-0000-0000-000000000002';

    function samplerFixture(
      pages: Array<
        | {
            sampledWallets: number;
            nextUserId: string | null;
            walletMismatches: Array<{
              userId: string;
              snapshot: string;
              derived: string;
            }>;
          }
        | Error
      >,
    ) {
      let afterUserId: string | null = null;
      let pendingCursor: string | null = null;
      const query = jest.fn(async (sql: string, parameters: unknown[]) => {
        if (sql.startsWith('SELECT state')) return [{ state: { afterUserId } }];
        if (sql.includes('AS "sampledWallets"')) {
          const page = pages.shift();
          if (page instanceof Error) throw page;
          return page ? [page] : [];
        }
        if (sql.startsWith('UPDATE runtime_job_checkpoints')) {
          pendingCursor = (
            JSON.parse(String(parameters[1])) as {
              afterUserId: string | null;
            }
          ).afterUserId;
        }
        return [];
      });
      const transaction = jest.fn(
        async (callback: (manager: unknown) => Promise<unknown>) => {
          pendingCursor = afterUserId;
          const result = await callback({ query });
          afterUserId = pendingCursor;
          return result;
        },
      );
      const ds = { transaction } as unknown as DataSource;
      const readParameters = () =>
        query.mock.calls
          .filter(([sql]) => sql.includes('AS "sampledWallets"'))
          .map(([, parameters]) => parameters);
      return {
        ds,
        query,
        transaction,
        cursor: () => afterUserId,
        readParameters,
      };
    }

    it('commits sample progress and lets a replacement sampler continue the shared cursor', async () => {
      const mismatch = { userId: secondId, snapshot: '7', derived: '5' };
      const { ds, cursor, readParameters } = samplerFixture([
        { sampledWallets: 1, nextUserId: firstId, walletMismatches: [] },
        {
          sampledWallets: 1,
          nextUserId: secondId,
          walletMismatches: [mismatch],
        },
      ]);

      expect(await new WalletReconciliationSampler(ds).sample(1)).toEqual([]);
      expect(cursor()).toBe(firstId);
      expect(await new WalletReconciliationSampler(ds).sample(1)).toEqual([
        mismatch,
      ]);
      expect(cursor()).toBe(secondId);
      expect(readParameters()).toEqual([
        [null, 1],
        [firstId, 1],
      ]);
    });

    it('keeps failed samples at the original cursor and retries without skipping wallets', async () => {
      const { ds, cursor, readParameters } = samplerFixture([
        { sampledWallets: 1, nextUserId: firstId, walletMismatches: [] },
        new Error('sample statement timed out'),
        { sampledWallets: 1, nextUserId: secondId, walletMismatches: [] },
      ]);
      const sampler = new WalletReconciliationSampler(ds);
      await sampler.sample(1);
      await expect(sampler.sample(1)).rejects.toThrow(
        'sample statement timed out',
      );
      expect(cursor()).toBe(firstId);
      await sampler.sample(1);
      expect(readParameters()).toEqual([
        [null, 1],
        [firstId, 1],
        [firstId, 1],
      ]);
    });

    it('rejects missing sampling metadata without committing a cursor or reporting a clean sample', async () => {
      const { ds, cursor } = samplerFixture([]);
      await expect(
        new WalletReconciliationSampler(ds).sample(1),
      ).rejects.toThrow('incomplete cursor metadata');
      expect(cursor()).toBeNull();
    });

    it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 10_001])(
      'rejects invalid sample size %s before opening a transaction',
      async (size) => {
        const { ds, transaction } = samplerFixture([]);
        await expect(
          new WalletReconciliationSampler(ds).sample(size),
        ).rejects.toThrow(RangeError);
        expect(transaction).not.toHaveBeenCalled();
      },
    );
  });

  describe('runOnce (full sweep on-demand)', () => {
    it('combines fast and deep reports and keeps direct financial diagnostic queries read-only', async () => {
      const ds = stubDataSource({
        imbalances: [{ currency: 'DIA', imbalance: '1' }],
        orphanCount: '0',
        walletMismatches: [{ userId: 'u1', snapshot: '9', derived: '8' }],
      });
      const { service } = makeService(ds);
      const report = await service.runOnce();

      expect(report).toEqual({
        currencyImbalances: [{ currency: 'DIA', imbalance: '1' }],
        receiptsWithoutTransaction: 0,
        walletMismatches: [{ userId: 'u1', snapshot: '9', derived: '8' }],
        ok: false,
      });

      // Checkpoint persistence is delegated/mocked above; direct ledger/receipt/wallet scans stay read-only.
      const calls = (ds.query as jest.Mock).mock.calls as Array<[string]>;
      expect(calls.length).toBeGreaterThan(0);
      for (const [sql] of calls) {
        expect(sql.trim().toUpperCase()).toMatch(/^(SELECT|WITH)\b/);
        expect(sql).not.toMatch(/\b(UPDATE|DELETE|INSERT|TRUNCATE)\b/i);
      }
    });
  });
});
