import { Inject, Injectable, Logger } from '@nestjs/common';
import { Histogram } from 'prom-client';

import { METRICS_REGISTRY } from '../../common/metrics/metrics.constants';

import type { Registry } from 'prom-client';

/**
 * Matching latency (docs/07 Giai đoạn 6, docs/services/matching-service.md): thời gian 1 ticket
 * chờ từ lúc enqueue tới lúc được ghép (matcher tìm ra cặp hợp lệ trong `tryPair`), theo matchType.
 * KHÔNG tính tới lúc confirm — đó là latency phản ứng của user, không phải của matcher.
 */
@Injectable()
export class MatchingMetrics {
  private readonly logger = new Logger(MatchingMetrics.name);
  private readonly ticketWaitSeconds: Histogram<'matchType'>;

  constructor(@Inject(METRICS_REGISTRY) registry: Registry) {
    this.ticketWaitSeconds = new Histogram({
      name: 'matching_ticket_wait_seconds',
      help: 'Thời gian ticket chờ từ enqueue tới matched (giây), theo matchType',
      labelNames: ['matchType'],
      buckets: [0.1, 0.5, 1, 2, 5, 10, 20, 30, 60, 120],
      registers: [registry],
    });
  }

  /**
   * Gọi NGAY SAU khi transaction ghép cặp đã commit, TRƯỚC vòng publish realtime `match.matched`
   * (matcher-worker.service.ts) — best-effort: lỗi ghi metric không được phép chặn publish (cùng
   * nguyên tắc `publishRealtimeEvent`, docs/services/realtime-gateway.md § 3).
   */
  observeMatched(matchType: string, waitSeconds: number): void {
    try {
      this.ticketWaitSeconds.observe({ matchType }, Math.max(0, waitSeconds));
    } catch (err) {
      this.logger.warn(
        `Ghi metric matching_ticket_wait_seconds lỗi: ${String(err)}`,
      );
    }
  }
}
