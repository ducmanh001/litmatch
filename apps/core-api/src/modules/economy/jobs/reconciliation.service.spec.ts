import type { Meter } from '@opentelemetry/api';

import { EconomyMetrics } from '../economy.metrics';
import { ReconciliationService } from './reconciliation.service';

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
};

/**
 * DataSource stub: fast tier gọi cận trên cửa sổ + tổng (lần đầu dựng lại từ toàn bộ lịch sử) + orphan, deep tier
 * gọi 1 (wallet sample). `imbalances` là tổng Nợ − Có theo currency mà lần dựng lại trả về.
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
  const dataSource = {
    query: jest.fn(async (sql: string) => {
      if (sql.includes('AS "to"'))
        return [{ to: '2026-10-19 00:00:00+00', advances: true, final: true }];
      if (sql.includes('GROUP BY le.currency'))
        return (input.imbalances ?? []).map(({ currency, imbalance }) => ({
          currency,
          delta: imbalance,
        }));
      if (sql.includes('iap_receipts'))
        return [{ count: input.orphanCount ?? '0' }];
      if (sql.includes('FROM sample_wallets'))
        return input.walletMismatches ?? [];
      throw new Error(`query không nhận diện được trong stub: ${sql}`);
    }),
  } as unknown as DataSource;
  Object.assign(dataSource, {
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
  afterEach(() => jest.useRealTimers());

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

  describe('đối soát tăng dần (ADR 0013)', () => {
    type Window = { to: string; advances: boolean; final: boolean };
    type Sum = Array<{ currency: string; delta: string }>;

    /** DataSource kịch bản: mỗi câu "cận trên cửa sổ" / "tổng" lấy phần tử kế tiếp trong hàng đợi. */
    function scripted(script: { windows: Window[]; sums: Array<Sum | Error> }) {
      const sumCalls: Array<{ full: boolean; params: unknown[] }> = [];
      const dataSource = {
        query: jest.fn(async (sql: string, params: unknown[] = []) => {
          if (sql.includes('AS "to"')) {
            const window = script.windows.shift();
            if (window === undefined) throw new Error('hết kịch bản window');
            return [window];
          }
          if (sql.includes('GROUP BY le.currency')) {
            sumCalls.push({ full: !sql.includes('t.created_at >='), params });
            const sum = script.sums.shift() ?? [];
            if (sum instanceof Error) throw sum;
            return sum;
          }
          if (sql.includes('iap_receipts')) return [{ count: '0' }];
          throw new Error(`query không nhận diện được trong stub: ${sql}`);
        }),
      } as unknown as DataSource;
      return { dataSource, sumCalls };
    }
    const window = (to: string, final = true): Window => ({
      to,
      advances: true,
      final,
    });

    it('lần đầu dựng lại từ toàn bộ lịch sử; các lần sau chỉ cộng cửa sổ [watermark, to) và dồn tổng', async () => {
      const { dataSource, sumCalls } = scripted({
        windows: [window('T1'), window('T2')],
        sums: [
          [{ currency: 'DIA', delta: '5' }],
          [{ currency: 'DIA', delta: '-5' }],
        ],
      });
      const { service } = makeService(dataSource);

      const first = await service.runFast();
      expect(first.currencyImbalances).toEqual([
        { currency: 'DIA', imbalance: '5' },
      ]);
      const second = await service.runFast();

      expect(second.ok).toBe(true);
      expect(sumCalls).toEqual([
        { full: true, params: ['T1'] },
        { full: false, params: ['T1', 'T2'] },
      ]);
    });

    it('job nghỉ lâu: chia nhiều cửa sổ trong một tick tới khi bắt kịp mốc an toàn', async () => {
      const { dataSource, sumCalls } = scripted({
        windows: [window('T1'), window('T2', false), window('T3', true)],
        sums: [[], [], []],
      });
      const { service } = makeService(dataSource);

      await service.runFast();
      await service.runFast();

      expect(sumCalls.map((call) => call.params)).toEqual([
        ['T1'],
        ['T1', 'T2'],
        ['T2', 'T3'],
      ]);
    });

    it('mốc an toàn chưa tiến (LAG chưa qua): không truy vấn tổng nào', async () => {
      const { dataSource, sumCalls } = scripted({
        windows: [window('T1'), { to: 'T1', advances: false, final: true }],
        sums: [[]],
      });
      const { service } = makeService(dataSource);

      await service.runFast();
      expect((await service.runFast()).ok).toBe(true);

      expect(sumCalls).toHaveLength(1);
    });

    it('dựng lại định kỳ: sau FULL_INTERVAL tính lại từ toàn bộ lịch sử và thay tổng cũ (bắt transaction commit muộn)', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-10-19T00:00:00Z'));
      const { dataSource, sumCalls } = scripted({
        windows: [window('T1'), window('T2'), window('T3')],
        // lần 2 (trong chu kỳ) cửa sổ không thấy gì; lần 3 dựng lại thấy transaction lệch commit muộn
        sums: [[], [], [{ currency: 'DIA', delta: '9' }]],
      });
      const { service } = makeService(dataSource);

      expect((await service.runFast()).ok).toBe(true);
      expect((await service.runFast()).ok).toBe(true);
      jest.setSystemTime(new Date('2026-10-20T00:00:01Z'));
      const rebased = await service.runFast();

      expect(rebased.ok).toBe(false);
      expect(rebased.currencyImbalances).toEqual([
        { currency: 'DIA', imbalance: '9' },
      ]);
      expect(sumCalls.map((call) => call.full)).toEqual([true, false, true]);
    });

    it('lỗi DB giữa cửa sổ không làm mất cửa sổ: tick sau tính lại đúng [watermark, to)', async () => {
      const { dataSource, sumCalls } = scripted({
        windows: [window('T1'), window('T2'), window('T2')],
        sums: [[], new Error('db down'), []],
      });
      const { service } = makeService(dataSource);

      await service.runFast();
      await expect(service.runFast()).rejects.toThrow('db down');
      expect((await service.runFast()).ok).toBe(true);

      expect(sumCalls.map((call) => call.params)).toEqual([
        ['T1'],
        ['T1', 'T2'],
        ['T1', 'T2'],
      ]);
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

  describe('runOnce (full sweep on-demand)', () => {
    it('gộp fast + deep, giữ report shape cũ; job READ-ONLY — chỉ SELECT, không mutation', async () => {
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

      // Bất biến read-only: mọi câu query của job phải là SELECT thuần
      const calls = (ds.query as jest.Mock).mock.calls as Array<[string]>;
      expect(calls.length).toBeGreaterThan(0);
      for (const [sql] of calls) {
        expect(sql.trim().toUpperCase()).toMatch(/^(SELECT|WITH)\b/);
        expect(sql).not.toMatch(/\b(UPDATE|DELETE|INSERT|TRUNCATE)\b/i);
      }
    });
  });
});
