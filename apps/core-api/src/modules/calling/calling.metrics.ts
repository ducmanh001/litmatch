import { Inject, Injectable, Logger } from '@nestjs/common';
import { Counter } from 'prom-client';

import { METRICS_REGISTRY } from '../../common/metrics/metrics.constants';

import type { Registry } from 'prom-client';

/**
 * Call drop rate (docs/07 Giai đoạn 6, docs/services/calling-service.md): tổng call kết thúc
 * theo `reason` (`CallEndReason`). "Drop rate" = tỉ lệ reason != completed, tính bằng PromQL ở
 * tầng dashboard (vd `sum(rate(call_ended_total{reason!="completed"}[5m])) / sum(rate(...))`) —
 * KHÔNG precompute tỉ lệ trong app vì counter thô mới đúng ngữ nghĩa Prometheus (rate/histogram
 * cộng dồn được qua nhiều instance, tỉ lệ tính sẵn thì không).
 */
@Injectable()
export class CallingMetrics {
  private readonly logger = new Logger(CallingMetrics.name);
  private readonly callEndedTotal: Counter<'reason'>;

  constructor(@Inject(METRICS_REGISTRY) registry: Registry) {
    this.callEndedTotal = new Counter({
      name: 'call_ended_total',
      help: 'Tổng số call kết thúc, theo lý do (CallEndReason)',
      labelNames: ['reason'],
      registers: [registry],
    });
  }

  /**
   * Gọi NGAY SAU khi `endById` đã lock+commit xong, TRƯỚC `cleanupEndedCall` (dọn room SFU +
   * publish realtime) — best-effort bắt buộc (cùng nguyên tắc `publishRealtimeEvent`,
   * docs/services/realtime-gateway.md § 3): lỗi ghi metric không được phép chặn dọn room, nếu
   * không sẽ leak room SFU — vi phạm bất biến "mọi nhánh end đều deleteRoom" (context-map.json § calling).
   */
  recordEnded(reason: string): void {
    try {
      this.callEndedTotal.inc({ reason });
    } catch (err) {
      this.logger.warn(`Ghi metric call_ended_total lỗi: ${String(err)}`);
    }
  }
}
