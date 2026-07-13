import { Registry } from 'prom-client';

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
};

/** DataSource stub: fast tier gọi 2 query (imbalance, orphan), deep tier gọi 1 (wallet sample). */
function stubDataSource(input: {
  imbalances?: Array<{ currency: string; imbalance: string }>;
  orphanCount?: string;
  walletMismatches?: Array<{
    userId: string;
    snapshot: string;
    derived: string;
  }>;
}): DataSource {
  return {
    query: jest.fn(async (sql: string) => {
      if (sql.includes('GROUP BY currency')) return input.imbalances ?? [];
      if (sql.includes('iap_receipts'))
        return [{ count: input.orphanCount ?? '0' }];
      if (sql.includes('FROM (SELECT * FROM wallets'))
        return input.walletMismatches ?? [];
      throw new Error(`query không nhận diện được trong stub: ${sql}`);
    }),
  } as unknown as DataSource;
}

function makeService(
  ds: DataSource,
  config = stubConfig(ENABLED_CONFIG),
  scheduler = stubScheduler().scheduler,
) {
  const registry = new Registry();
  const service = new ReconciliationService(
    ds,
    config,
    scheduler,
    new EconomyMetrics(registry),
  );
  return { service, registry };
}

describe('ReconciliationService', () => {
  afterEach(() => jest.useRealTimers());

  describe('lập lịch 2 tier độc lập', () => {
    it('bootstrap đăng ký 2 interval riêng (fast + deep) theo đúng interval config', () => {
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
      jest.advanceTimersByTime(60_000);
      expect(fastSpy).toHaveBeenCalledTimes(1);
      expect(deepSpy).toHaveBeenCalledTimes(0);

      // tới 300s: fast đã chạy 5 lần, deep 1 lần
      jest.advanceTimersByTime(240_000);
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
      } as unknown as DataSource;
      const { scheduler } = stubScheduler();
      const { service, registry } = makeService(
        failingDs,
        stubConfig(ENABLED_CONFIG),
        scheduler,
      );
      service.onApplicationBootstrap();

      await jest.advanceTimersByTimeAsync(60_000); // flush cả microtask của promise trong callback

      const text = await registry.metrics();
      expect(text).toContain(
        'economy_reconciliation_last_run_status{tier="fast"} 0',
      );
      // run lỗi giữa chừng KHÔNG ghi duration (tránh nhiễu histogram bởi run dở dang)
      expect(text).not.toContain(
        'economy_reconciliation_run_duration_seconds_count{tier="fast"}',
      );
      service.onApplicationShutdown();
    });
  });

  describe('metrics tier fast', () => {
    it('lệch bất biến + orphan receipt: counter theo check/currency, status = 0', async () => {
      const { service, registry } = makeService(
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

      const text = await registry.metrics();
      expect(text).toContain(
        'economy_reconciliation_mismatch_total{check="invariant",currency="DIA"} 1',
      );
      expect(text).toContain(
        'economy_reconciliation_mismatch_total{check="invariant",currency="PTS"} 1',
      );
      expect(text).toContain(
        'economy_reconciliation_mismatch_total{check="orphan_receipt",currency="DIA"} 2',
      );
      expect(text).toContain(
        'economy_reconciliation_last_run_status{tier="fast"} 0',
      );
      expect(text).toContain(
        'economy_reconciliation_run_duration_seconds_count{tier="fast"} 1',
      );
    });

    it('cân sổ: status = 1, không có series mismatch nào', async () => {
      const { service, registry } = makeService(stubDataSource({}));
      const report = await service.runFast();
      expect(report.ok).toBe(true);

      const text = await registry.metrics();
      expect(text).toContain(
        'economy_reconciliation_last_run_status{tier="fast"} 1',
      );
      expect(text).not.toContain('economy_reconciliation_mismatch_total{');
    });
  });

  describe('metrics tier deep', () => {
    it('snapshot ví lệch ledger: counter wallet_sample, status deep = 0', async () => {
      const { service, registry } = makeService(
        stubDataSource({
          walletMismatches: [
            { userId: 'u1', snapshot: '100', derived: '93' },
            { userId: 'u2', snapshot: '5', derived: '0' },
          ],
        }),
      );
      const report = await service.runDeep();
      expect(report.ok).toBe(false);

      const text = await registry.metrics();
      expect(text).toContain(
        'economy_reconciliation_mismatch_total{check="wallet_sample",currency="DIA"} 2',
      );
      expect(text).toContain(
        'economy_reconciliation_last_run_status{tier="deep"} 0',
      );
      expect(text).toContain(
        'economy_reconciliation_run_duration_seconds_count{tier="deep"} 1',
      );
    });

    it('khớp hết: status deep = 1', async () => {
      const { service, registry } = makeService(stubDataSource({}));
      expect((await service.runDeep()).ok).toBe(true);
      expect(await registry.metrics()).toContain(
        'economy_reconciliation_last_run_status{tier="deep"} 1',
      );
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
        expect(sql.trim().toUpperCase().startsWith('SELECT')).toBe(true);
        expect(sql).not.toMatch(/\b(UPDATE|DELETE|INSERT|TRUNCATE)\b/i);
      }
    });
  });
});
