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

import type { CoreApiEnv } from '../../../config/env.validation';

const JOB = 'economy-reconciliation';
/** Số ví lấy mẫu đối chiếu snapshot↔ledger mỗi run — ngưỡng vận hành nội bộ, không phải rule nghiệp vụ. */
const WALLET_SAMPLE_SIZE = 100;

export interface ReconciliationReport {
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
 * Job đối soát (docs/services/economy-service.md § 2, chạy từ Giai đoạn 1 theo roadmap):
 * hệ thống double-entry TỰ PHÁT HIỆN tiền sinh ra/mất đi từ hư không bằng bất biến toán học.
 * Lệch = log error (Giai đoạn 6/7 nối vào metric + alert).
 */
@Injectable()
export class ReconciliationService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService<CoreApiEnv, true>,
    private readonly scheduler: SchedulerRegistry,
  ) {}

  onApplicationBootstrap(): void {
    if (
      !this.config.getOrThrow('ECONOMY_RECONCILIATION_ENABLED', { infer: true })
    )
      return;
    const interval = setInterval(
      () =>
        void this.runOnce().catch((err) =>
          this.logger.error({ err: `${err}` }, 'Reconciliation lỗi'),
        ),
      this.config.getOrThrow('ECONOMY_RECONCILIATION_INTERVAL_MS', {
        infer: true,
      }),
    );
    this.scheduler.addInterval(JOB, interval);
  }

  onApplicationShutdown(): void {
    if (this.scheduler.doesExist('interval', JOB))
      this.scheduler.deleteInterval(JOB);
  }

  async runOnce(
    sampleWallets = WALLET_SAMPLE_SIZE,
  ): Promise<ReconciliationReport> {
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

    const report: ReconciliationReport = {
      currencyImbalances: imbalances,
      receiptsWithoutTransaction: Number(orphanReceipts),
      walletMismatches,
      ok:
        imbalances.length === 0 &&
        Number(orphanReceipts) === 0 &&
        walletMismatches.length === 0,
    };

    if (!report.ok) {
      this.logger.error(
        { report },
        'ĐỐI SOÁT LỆCH — ledger/wallet/receipt không khớp, cần điều tra ngay',
      );
    } else {
      this.logger.debug(
        'Đối soát OK — tổng Nợ = tổng Có, snapshot khớp ledger',
      );
    }
    return report;
  }
}
