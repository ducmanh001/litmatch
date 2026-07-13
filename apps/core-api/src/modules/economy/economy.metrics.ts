import { Inject, Injectable, Logger } from '@nestjs/common';
import { Counter } from 'prom-client';

import { METRICS_REGISTRY } from '../../common/metrics/metrics.constants';

import type { Registry } from 'prom-client';

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

  constructor(@Inject(METRICS_REGISTRY) registry: Registry) {
    this.transactionsTotal = new Counter({
      name: 'economy_transaction_total',
      help: 'Tổng giao dịch ledger, theo type và kết quả (success|replayed|failed)',
      labelNames: ['type', 'result'],
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
}
