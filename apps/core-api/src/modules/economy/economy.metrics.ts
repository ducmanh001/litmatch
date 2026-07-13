import { Inject, Injectable, Logger } from '@nestjs/common';
import { Counter, Gauge, Histogram } from 'prom-client';

import { METRICS_REGISTRY } from '../../common/metrics/metrics.constants';

import type { Registry } from 'prom-client';

/** Tier của job đối soát — fast (bất biến toàn cục, rẻ) vs deep (sample ví, đắt). */
export type ReconciliationTier = 'fast' | 'deep';

/** Loại check đối soát phát hiện lệch — khớp 3 check trong ReconciliationService. */
export type ReconciliationCheck =
  'invariant' | 'orphan_receipt' | 'wallet_sample';

/**
 * Transaction failure rate (docs/07 Giai đoạn 6, docs/03 § 3.8.C): mọi giao dịch ledger đi qua
 * `LedgerService.record()` — điểm đo DUY NHẤT bao trùm toàn bộ Economy (IAP, VIP, speedup, gift,
 * refund...) vì đây là writer duy nhất của ledger/wallet. `result`:
 * - success: ghi sổ thành công, giao dịch mới.
 * - replayed: trùng idempotency key — không phải lỗi (docs/05 § 5.10).
 * - failed: rollback (vd không đủ diamond, lỗi hạ tầng) — tử số của "failure rate" tính ở
 *   dashboard bằng `sum(rate(economy_transaction_total{result="failed"}[5m])) / sum(rate(...))`.
 */
@Injectable()
export class EconomyMetrics {
  private readonly logger = new Logger(EconomyMetrics.name);
  private readonly transactionsTotal: Counter<'type' | 'result'>;
  private readonly reconciliationMismatchTotal: Counter<'check' | 'currency'>;
  private readonly reconciliationLastRunStatus: Gauge<'tier'>;
  private readonly reconciliationRunSeconds: Histogram<'tier'>;

  constructor(@Inject(METRICS_REGISTRY) registry: Registry) {
    this.transactionsTotal = new Counter({
      name: 'economy_transaction_total',
      help: 'Tổng giao dịch ledger, theo type và kết quả (success|replayed|failed)',
      labelNames: ['type', 'result'],
      registers: [registry],
    });
    // Metrics đối soát (docs/07 Giai đoạn 7, docs/03 § 3.8.C): đây là kênh "cảnh báo tự động"
    // duy nhất của repo — alert rule Prometheus fire trên các metric này, không có channel khác.
    this.reconciliationMismatchTotal = new Counter({
      name: 'economy_reconciliation_mismatch_total',
      help: 'Số lệch đối soát phát hiện được, theo check (invariant|orphan_receipt|wallet_sample) và currency. Alert: increase(...) > 0.',
      labelNames: ['check', 'currency'],
      registers: [registry],
    });
    this.reconciliationLastRunStatus = new Gauge({
      name: 'economy_reconciliation_last_run_status',
      help: 'Trạng thái run đối soát gần nhất theo tier (fast|deep): 1 = chạy xong và cân, 0 = có lệch HOẶC run lỗi (DB down...). Alert: == 0.',
      labelNames: ['tier'],
      registers: [registry],
    });
    this.reconciliationRunSeconds = new Histogram({
      name: 'economy_reconciliation_run_duration_seconds',
      help: 'Thời gian 1 run đối soát (giây) theo tier — theo dõi chi phí khi ledger lớn dần',
      labelNames: ['tier'],
      buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60],
      registers: [registry],
    });
  }

  /**
   * `record()` được gọi NGAY SAU khi ledger đã commit/replay/fail xong (docs/services/ledger)
   * — best-effort giống `publishRealtimeEvent` (docs/services/realtime-gateway.md § 3): lỗi ở
   * đây KHÔNG bao giờ được phép làm caller tưởng giao dịch tiền thất bại trong khi thật ra đã
   * ghi sổ xong (hoặc ngược lại chặn side effect tiếp theo như dọn room ở Calling).
   */
  record(type: string, result: 'success' | 'replayed' | 'failed'): void {
    try {
      this.transactionsTotal.inc({ type, result });
    } catch (err) {
      this.logger.warn(
        `Ghi metric economy_transaction_total lỗi: ${String(err)}`,
      );
    }
  }

  /**
   * Ghi 1 lệch đối soát — gọi từ ReconciliationService NGAY SAU khi phát hiện, best-effort:
   * lỗi ghi metric không được nuốt mất `logger.error` báo lệch (log chạy độc lập trước đó).
   */
  recordReconciliationMismatch(
    check: ReconciliationCheck,
    currency: string,
    count = 1,
  ): void {
    try {
      if (count > 0)
        this.reconciliationMismatchTotal.inc({ check, currency }, count);
    } catch (err) {
      this.logger.warn(
        `Ghi metric economy_reconciliation_mismatch_total lỗi: ${String(err)}`,
      );
    }
  }

  /**
   * Ghi kết quả 1 run đối soát theo tier. `ok=false` cho CẢ trường hợp phát hiện lệch lẫn run
   * lỗi giữa chừng (DB down) — alert `last_run_status == 0` bắt được cả hai. `durationSeconds`
   * bỏ qua (undefined) khi run lỗi để histogram không bị nhiễu bởi run dở dang.
   */
  recordReconciliationRun(
    tier: ReconciliationTier,
    ok: boolean,
    durationSeconds?: number,
  ): void {
    try {
      this.reconciliationLastRunStatus.set({ tier }, ok ? 1 : 0);
      if (durationSeconds !== undefined)
        this.reconciliationRunSeconds.observe(
          { tier },
          Math.max(0, durationSeconds),
        );
    } catch (err) {
      this.logger.warn(
        `Ghi metric reconciliation run (tier=${tier}) lỗi: ${String(err)}`,
      );
    }
  }
}
