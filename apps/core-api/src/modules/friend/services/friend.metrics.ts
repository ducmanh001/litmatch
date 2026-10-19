import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Counter, Meter } from '@opentelemetry/api';

import { METRICS_METER } from '../../../common/metrics/metrics.constants';

/** Kết quả quyết định thông báo cho một tin nhắn bạn bè (xem `FriendMessageNotifier`). */
export type FriendMessageNotifyOutcome =
  'notified' | 'coalesced' | 'muted' | 'gate_error' | 'error';

/**
 * Đo chính sách gộp thông báo tin nhắn (docs/services/friend-service.md, ADR 0013): tỉ lệ
 * `coalesced / (notified + coalesced)` là mức giảm insert `notifications` + push; `gate_error` tăng
 * nghĩa là Redis lỗi và hệ thống đang fail-open (mỗi tin một thông báo như trước).
 */
@Injectable()
export class FriendMetrics {
  private readonly logger = new Logger(FriendMetrics.name);
  private readonly messageNotifications: Counter;

  constructor(@Inject(METRICS_METER) meter: Meter) {
    this.messageNotifications = meter.createCounter(
      'friend_message_notifications_total',
      {
        description:
          'Quyết định thông báo cho tin nhắn bạn bè, theo kết quả: notified | coalesced | muted | gate_error | error',
      },
    );
  }

  /** Best-effort: lỗi ghi metric không được phép ảnh hưởng luồng gửi tin nhắn. */
  observeNotify(outcome: FriendMessageNotifyOutcome): void {
    try {
      this.messageNotifications.add(1, { outcome });
    } catch (err) {
      this.logger.warn(
        `Ghi metric friend_message_notifications_total lỗi: ${String(err)}`,
      );
    }
  }
}
