import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { ManagedInterval } from '../../../common/scheduling/managed-interval';
import type { CoreApiEnv } from '../../../config/env.validation';
import { EconomyMetrics } from '../economy.metrics';
import { LedgerCurrency } from '../entities/ledger-account.entity';

import type { ReconciliationTier } from '../economy.metrics';

const JOB_FAST = 'economy-reconciliation-fast';
const JOB_DEEP = 'economy-reconciliation-deep';
/** Số ví lấy mẫu đối chiếu snapshot↔ledger mỗi run — ngưỡng vận hành nội bộ, không phải rule nghiệp vụ. */
const WALLET_SAMPLE_SIZE = 100;

interface FastReconciliationReport {
  currencyImbalances: Array<{ currency: string; imbalance: string }>;
  receiptsWithoutTransaction: number;
  ok: boolean;
}

interface DeepReconciliationReport {
  walletMismatches: Array<{
    userId: string;
    snapshot: string;
    derived: string;
  }>;
  ok: boolean;
}

interface ReconciliationReport {
  currencyImbalances: Array<{ currency: string; imbalance: string }>;
  receiptsWithoutTransaction: number;
  walletMismatches: Array<{
    userId: string;
    snapshot: string;
    derived: string;
  }>;
  ok: boolean;
}

/**
 * Job đối soát (docs/services/economy-service.md § 2, docs/03 § 3.8.C): hệ thống double-entry
 * TỰ PHÁT HIỆN tiền sinh ra/mất đi từ hư không bằng bất biến toán học. Từ Giai đoạn 7 tách 2 tier
 * lịch độc lập theo chi phí query:
 * - fast (ECONOMY_RECONCILIATION_FAST_INTERVAL_MS): bất biến Nợ=Có theo currency + orphan
 *   receipt — 1 câu aggregate + 1 câu COUNT, đủ rẻ để chạy dày.
 * - deep (ECONOMY_RECONCILIATION_INTERVAL_MS): sample ví so snapshot↔derived — scan/join theo
 *   từng ví nên đắt hơn, giữ cadence thưa như cũ.
 * Lệch = log error + metric `economy_reconciliation_*` (EconomyMetrics) để alert rule Prometheus
 * fire — repo không có channel alert nào khác ngoài scrape /metrics.
 *
 * BẤT BIẾN: job này READ-ONLY tuyệt đối — chỉ SELECT, không auto-correct. Sửa lệch thật phải đi
 * qua reversal entry ở write path chuẩn (LedgerService), không bao giờ từ job chẩn đoán này.
 */
@Injectable()
export class ReconciliationService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(ReconciliationService.name);
  private readonly fastJob = new ManagedInterval();
  private readonly deepJob = new ManagedInterval();

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService<CoreApiEnv, true>,
    private readonly scheduler: SchedulerRegistry,
    private readonly metrics: EconomyMetrics,
  ) {}

  onApplicationBootstrap(): void {
    // 1 cờ tắt CẢ HAI tier — giữ nguyên hợp đồng ECONOMY_RECONCILIATION_ENABLED=false có trước
    if (
      !this.config.getOrThrow('ECONOMY_RECONCILIATION_ENABLED', { infer: true })
    )
      return;
    this.fastJob.start(this.scheduler, {
      jobName: JOB_FAST,
      intervalMs: this.config.getOrThrow(
        'ECONOMY_RECONCILIATION_FAST_INTERVAL_MS',
        { infer: true },
      ),
      task: () => this.scheduledRun('fast', () => this.runFast()),
      logger: this.logger,
      errorMessage: 'Reconciliation fast timer lỗi ngoài boundary',
    });
    this.deepJob.start(this.scheduler, {
      jobName: JOB_DEEP,
      intervalMs: this.config.getOrThrow('ECONOMY_RECONCILIATION_INTERVAL_MS', {
        infer: true,
      }),
      task: () => this.scheduledRun('deep', () => this.runDeep()),
      logger: this.logger,
      errorMessage: 'Reconciliation deep timer lỗi ngoài boundary',
    });
  }

  onApplicationShutdown(): void {
    this.fastJob.stop();
    this.deepJob.stop();
  }

  /** Run theo lịch: nuốt lỗi để interval sống tiếp, nhưng gauge tier = 0 để alert thấy job chết. */
  private async scheduledRun(
    tier: ReconciliationTier,
    run: () => Promise<unknown>,
  ): Promise<void> {
    try {
      await run();
    } catch (err) {
      this.metrics.recordReconciliationRun(tier, false);
      this.logger.error({ err: `${err}` }, `Reconciliation (${tier}) lỗi`);
    }
  }

  /** Tier rẻ: bất biến toàn cục + orphan receipt. Chạy dày (fast interval). */
  async runFast(): Promise<FastReconciliationReport> {
    const startedAt = Date.now();
    // 1. Bất biến toàn cục: tổng Nợ = tổng Có theo từng currency
    const imbalances: Array<{ currency: string; imbalance: string }> =
      await this.dataSource.query(`
      SELECT currency,
             SUM(CASE WHEN direction = 'debit' THEN amount ELSE -amount END)::text AS imbalance
      FROM ledger_entries GROUP BY currency
      HAVING SUM(CASE WHEN direction = 'debit' THEN amount ELSE -amount END) <> 0
    `);

    // 2. Receipt đã credit phải có đúng 1 transaction ledger đi kèm
    const [{ count: orphanReceipts }]: Array<{ count: string }> =
      await this.dataSource.query(
        `SELECT COUNT(*)::text AS count FROM iap_receipts WHERE status = 'credited' AND transaction_id IS NULL`,
      );

    const report: FastReconciliationReport = {
      currencyImbalances: imbalances,
      receiptsWithoutTransaction: Number(orphanReceipts),
      ok: imbalances.length === 0 && Number(orphanReceipts) === 0,
    };

    for (const { currency } of imbalances)
      this.metrics.recordReconciliationMismatch('invariant', currency);
    // Receipt IAP hiện chỉ credit diamond — gắn currency tường minh để alert rule filter được
    this.metrics.recordReconciliationMismatch(
      'orphan_receipt',
      LedgerCurrency.Diamond,
      report.receiptsWithoutTransaction,
    );
    this.metrics.recordReconciliationRun(
      'fast',
      report.ok,
      (Date.now() - startedAt) / 1000,
    );

    if (!report.ok) {
      this.logger.error(
        { report },
        'ĐỐI SOÁT LỆCH (fast) — tổng Nợ/Có hoặc receipt không khớp, cần điều tra ngay',
      );
    } else {
      this.logger.debug('Đối soát fast OK — tổng Nợ = tổng Có, receipt khớp');
    }
    return report;
  }

  /** Tier đắt: sample ví so snapshot↔derived từ ledger. Giữ cadence thưa (interval cũ). */
  async runDeep(
    sampleWallets = WALLET_SAMPLE_SIZE,
  ): Promise<DeepReconciliationReport> {
    const startedAt = Date.now();
    // 3. Sample ví mới cập nhật gần nhất: snapshot phải khớp derive từ ledger
    const walletMismatches: Array<{
      userId: string;
      snapshot: string;
      derived: string;
    }> = await this.dataSource.query(
      `
        SELECT w.user_id AS "userId", w.balance::text AS snapshot, COALESCE(d.derived, 0)::text AS derived
        FROM (SELECT * FROM wallets ORDER BY updated_at DESC LIMIT $1) w
        LEFT JOIN (
          SELECT la.user_id,
                 SUM(CASE WHEN le.direction = 'credit' THEN le.amount ELSE -le.amount END) AS derived
          FROM ledger_entries le
          JOIN ledger_accounts la ON la.id = le.account_id
          WHERE la.kind = 'user_wallet'
          GROUP BY la.user_id
        ) d ON d.user_id = w.user_id
        WHERE w.balance <> COALESCE(d.derived, 0)
        `,
      [sampleWallets],
    );

    const report: DeepReconciliationReport = {
      walletMismatches,
      ok: walletMismatches.length === 0,
    };

    // Wallet snapshot là số dư diamond (docs/02) — currency tường minh cho alert rule
    this.metrics.recordReconciliationMismatch(
      'wallet_sample',
      LedgerCurrency.Diamond,
      walletMismatches.length,
    );
    this.metrics.recordReconciliationRun(
      'deep',
      report.ok,
      (Date.now() - startedAt) / 1000,
    );

    if (!report.ok) {
      this.logger.error(
        { report },
        'ĐỐI SOÁT LỆCH (deep) — snapshot ví không khớp ledger, cần điều tra ngay',
      );
    } else {
      this.logger.debug('Đối soát deep OK — snapshot khớp ledger');
    }
    return report;
  }

  /** Full sweep on-demand (test/tool vận hành): fast + deep gộp, giữ report shape cũ. */
  async runOnce(
    sampleWallets = WALLET_SAMPLE_SIZE,
  ): Promise<ReconciliationReport> {
    const fast = await this.runFast();
    const deep = await this.runDeep(sampleWallets);
    return {
      currencyImbalances: fast.currencyImbalances,
      receiptsWithoutTransaction: fast.receiptsWithoutTransaction,
      walletMismatches: deep.walletMismatches,
      ok: fast.ok && deep.ok,
    };
  }
}
