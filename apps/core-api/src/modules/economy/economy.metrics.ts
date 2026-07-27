import { Inject, Injectable, Logger } from '@nestjs/common';

import type {
  Counter,
  Histogram,
  Meter,
  ObservableGauge,
} from '@opentelemetry/api';

import { METRICS_METER } from '../../common/metrics/metrics.constants';

/** Tier của job đối soát — fast (bất biến toàn cục, rẻ) vs deep (sample ví, đắt). */
export type ReconciliationTier = 'fast' | 'deep';

/** Loại check đối soát phát hiện lệch. */
export type ReconciliationCheck =
  'invariant' | 'orphan_receipt' | 'wallet_sample';

/**
 * Metrics Economy dùng OTel instruments để PeriodicExportingMetricReader push thẳng Grafana.
 * Các method vẫn best-effort: lỗi metrics không được làm thay đổi kết quả giao dịch tiền.
 */
@Injectable()
export class EconomyMetrics {
  private readonly logger = new Logger(EconomyMetrics.name);
  private readonly transactionsTotal: Counter;
  private readonly reconciliationMismatchTotal: Counter;
  private readonly reconciliationLastRunStatus: ObservableGauge;
  private readonly reconciliationRunSeconds: Histogram;
  private readonly reconciliationStatusByTier = new Map<
    ReconciliationTier,
    number
  >();

  constructor(@Inject(METRICS_METER) meter: Meter) {
    this.transactionsTotal = meter.createCounter('economy_transaction_total', {
      description:
        'Tổng giao dịch ledger, theo type và kết quả (success|replayed|failed)',
    });
    this.reconciliationMismatchTotal = meter.createCounter(
      'economy_reconciliation_mismatch_total',
      {
        description:
          'Số lệch đối soát phát hiện được, theo check và currency. Alert: increase(...) > 0.',
      },
    );
    this.reconciliationLastRunStatus = meter.createObservableGauge(
      'economy_reconciliation_last_run_status',
      {
        description:
          'Trạng thái run đối soát gần nhất theo tier: 1 = cân, 0 = lệch hoặc lỗi',
        unit: '1',
      },
    );
    this.reconciliationLastRunStatus.addCallback((result) => {
      for (const [tier, status] of this.reconciliationStatusByTier) {
        result.observe(status, { tier });
      }
    });
    this.reconciliationRunSeconds = meter.createHistogram(
      'economy_reconciliation_run_duration_seconds',
      {
        description:
          'Thời gian 1 run đối soát (giây) theo tier — theo dõi chi phí khi ledger lớn dần',
        unit: 's',
        advice: {
          explicitBucketBoundaries: [
            0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60,
          ],
        },
      },
    );
  }

  record(type: string, result: 'success' | 'replayed' | 'failed'): void {
    try {
      this.transactionsTotal.add(1, { type, result });
    } catch (err) {
      this.logger.warn(
        `Ghi metric economy_transaction_total lỗi: ${String(err)}`,
      );
    }
  }

  recordReconciliationMismatch(
    check: ReconciliationCheck,
    currency: string,
    count = 1,
  ): void {
    try {
      if (count > 0) {
        this.reconciliationMismatchTotal.add(count, { check, currency });
      }
    } catch (err) {
      this.logger.warn(
        `Ghi metric economy_reconciliation_mismatch_total lỗi: ${String(err)}`,
      );
    }
  }

  recordReconciliationRun(
    tier: ReconciliationTier,
    ok: boolean,
    durationSeconds?: number,
  ): void {
    try {
      this.reconciliationStatusByTier.set(tier, ok ? 1 : 0);
      if (durationSeconds !== undefined) {
        this.reconciliationRunSeconds.record(Math.max(0, durationSeconds), {
          tier,
        });
      }
    } catch (err) {
      this.logger.warn(
        `Ghi metric reconciliation run (tier=${tier}) lỗi: ${String(err)}`,
      );
    }
  }
}
