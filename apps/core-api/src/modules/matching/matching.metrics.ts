import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Histogram, Meter } from '@opentelemetry/api';

import { METRICS_METER } from '../../common/metrics/metrics.constants';

/**
 * Matching latency (docs/07 Giai đoạn 6, docs/services/matching-service.md): thời gian 1 ticket
 * chờ từ lúc enqueue tới lúc được ghép (matcher tìm ra cặp hợp lệ trong `tryPair`), theo matchType.
 * KHÔNG tính tới lúc confirm — đó là latency phản ứng của user, không phải của matcher.
 */
@Injectable()
export class MatchingMetrics {
  private readonly logger = new Logger(MatchingMetrics.name);
  private readonly ticketWaitSeconds: Histogram;

  constructor(@Inject(METRICS_METER) meter: Meter) {
    this.ticketWaitSeconds = meter.createHistogram(
      'matching_ticket_wait_seconds',
      {
        description:
          'Thời gian ticket chờ từ enqueue tới matched (giây), theo matchType',
        unit: 's',
        advice: {
          explicitBucketBoundaries: [0.1, 0.5, 1, 2, 5, 10, 20, 30, 60, 120],
        },
      },
    );
  }

  /**
   * Gọi NGAY SAU khi transaction ghép cặp đã commit, TRƯỚC vòng publish realtime `match.matched`
   * (matcher-worker.service.ts) — best-effort: lỗi ghi metric không được phép chặn publish (cùng
   * nguyên tắc `publishRealtimeEvent`, docs/services/realtime-gateway.md § 3).
   */
  observeMatched(matchType: string, waitSeconds: number): void {
    try {
      this.ticketWaitSeconds.record(Math.max(0, waitSeconds), { matchType });
    } catch (err) {
      this.logger.warn(
        `Ghi metric matching_ticket_wait_seconds lỗi: ${String(err)}`,
      );
    }
  }
}
