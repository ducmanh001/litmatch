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
import { LedgerReconciliationCheckpoint } from './ledger-reconciliation-checkpoint';
import type { LedgerReconciliationProgress } from './ledger-reconciliation-checkpoint';
import { WalletReconciliationSampler } from './wallet-reconciliation-sampler';

import type { ReconciliationTier } from '../economy.metrics';

const JOB_FAST = 'economy-reconciliation-fast';
const JOB_DEEP = 'economy-reconciliation-deep';
/** Số ví lấy mẫu đối chiếu snapshot↔ledger mỗi run — ngưỡng vận hành nội bộ, không phải rule nghiệp vụ. */
const WALLET_SAMPLE_SIZE = 100;

interface FastReconciliationReport {
  currencyImbalances: Array<{ currency: string; imbalance: string }>;
  receiptsWithoutTransaction: number;
  ok: boolean;
  complete: boolean;
  completedBefore: string | null;
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
 *   receipt. Bất biến được kiểm TĂNG DẦN (xem dưới) nên chi phí mỗi tick tỉ lệ với số giao dịch MỚI, không
 *   phải cả bảng ledger_entries; COUNT orphan chạy trên partial index gần như rỗng.
 * - deep (ECONOMY_RECONCILIATION_INTERVAL_MS): sample ví so snapshot↔derived — scan/join theo
 *   từng ví nên đắt hơn, giữ cadence thưa như cũ.
 * LedgerReconciliationCheckpoint pages whole transactions and persists each aggregate/cursor
 * atomically in runtime_job_checkpoints. Both cold-start and periodic rebase are bounded;
 * a replacement pod resumes the shared cursor. Incomplete history never reports a successful audit.
 * LAG must exceed the longest financial transaction. Late/backdated inserts are caught by a
 * subsequent full paged rebase; its completion time depends on backlog and configured capacity.
 *
 * Lệch = log error + metric `economy_reconciliation_*` (EconomyMetrics) để alert rule Prometheus
 * fire — metrics được push trực tiếp lên Grafana Cloud qua OTLP khi đã cấu hình.
 *
 * BẤT BIẾN: financial tables are read-only here. Only diagnostic checkpoints may be updated
 * (ADR 0015); corrections still require reversal entries through LedgerService.
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
      clusterSingleton: { dataSource: this.dataSource },
    });
    this.deepJob.start(this.scheduler, {
      jobName: JOB_DEEP,
      intervalMs: this.config.getOrThrow('ECONOMY_RECONCILIATION_INTERVAL_MS', {
        infer: true,
      }),
      task: () => this.scheduledRun('deep', () => this.runDeep()),
      logger: this.logger,
      errorMessage: 'Reconciliation deep timer lỗi ngoài boundary',
      clusterSingleton: { dataSource: this.dataSource },
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
    // 1. Bất biến toàn cục: tổng Nợ = tổng Có theo từng currency (cộng dồn tăng dần)
    const progress = await this.currentImbalances();
    const imbalances = progress.imbalances;

    // 2. Receipt đã credit phải có đúng 1 transaction ledger đi kèm
    const [{ count: orphanReceipts }]: Array<{ count: string }> =
      await this.dataSource.query(
        `SELECT COUNT(*)::text AS count FROM iap_receipts WHERE status = 'credited' AND transaction_id IS NULL`,
      );

    const report: FastReconciliationReport = {
      currencyImbalances: imbalances,
      receiptsWithoutTransaction: Number(orphanReceipts),
      ok:
        progress.complete &&
        imbalances.length === 0 &&
        Number(orphanReceipts) === 0,
      complete: progress.complete,
      completedBefore: progress.completedBefore,
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

    if (
      !progress.complete &&
      imbalances.length === 0 &&
      Number(orphanReceipts) === 0
    ) {
      this.logger.warn(
        'Reconciliation is catching up; incomplete history is not a successful audit',
      );
    } else if (!report.ok) {
      this.logger.error(
        { report },
        'ĐỐI SOÁT LỆCH (fast) — tổng Nợ/Có hoặc receipt không khớp, cần điều tra ngay',
      );
    } else {
      this.logger.debug('Đối soát fast OK — tổng Nợ = tổng Có, receipt khớp');
    }
    return report;
  }

  private currentImbalances(): Promise<LedgerReconciliationProgress> {
    return new LedgerReconciliationCheckpoint(this.dataSource).advance({
      lagMs: this.config.getOrThrow('ECONOMY_RECONCILIATION_LAG_MS', {
        infer: true,
      }),
      fullIntervalMs: this.config.getOrThrow(
        'ECONOMY_RECONCILIATION_FULL_INTERVAL_MS',
        { infer: true },
      ),
      batchSize: this.config.getOrThrow('ECONOMY_RECONCILIATION_BATCH_SIZE', {
        infer: true,
      }),
      maxBatches: this.config.getOrThrow(
        'ECONOMY_RECONCILIATION_MAX_BATCHES_PER_TICK',
        { infer: true },
      ),
      budgetMs: this.config.getOrThrow(
        'ECONOMY_RECONCILIATION_TICK_BUDGET_MS',
        { infer: true },
      ),
    });
  }

  /** Tier đắt: sample ví so snapshot↔derived từ ledger. Giữ cadence thưa (interval cũ). */
  async runDeep(
    sampleWallets = WALLET_SAMPLE_SIZE,
  ): Promise<DeepReconciliationReport> {
    const startedAt = Date.now();
    const walletMismatches = await new WalletReconciliationSampler(
      this.dataSource,
    ).sample(sampleWallets);

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

  /** Combined bounded diagnostic run; deep is a rotating wallet sample, not a full-fleet audit. */
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
