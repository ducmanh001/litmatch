import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Counter, Meter } from '@opentelemetry/api';

import { METRICS_METER } from '../../../common/metrics/metrics.constants';

export type OtpDeliveryOutcome = 'sent' | 'failed';

/**
 * Đo giao mã OTP qua SMS (ADR 0013). Cổng SMS chết thì không ai đăng nhập được bằng số điện thoại mà
 * response chỉ là 503 (HttpException không vào Sentry) — `failed` tăng là tín hiệu để cảnh báo.
 */
@Injectable()
export class AuthMetrics {
  private readonly logger = new Logger(AuthMetrics.name);
  private readonly otpDelivery: Counter;

  constructor(@Inject(METRICS_METER) meter: Meter) {
    this.otpDelivery = meter.createCounter('auth_otp_delivery_total', {
      description:
        'Kết quả giao mã OTP qua cổng SMS (AUTH_OTP_DELIVERY=sms-http): sent | failed',
    });
  }

  /** Best-effort: lỗi ghi metric không được phép ảnh hưởng luồng đăng nhập. */
  observeOtpDelivery(outcome: OtpDeliveryOutcome): void {
    try {
      this.otpDelivery.add(1, { outcome });
    } catch (err) {
      this.logger.warn(
        `Ghi metric auth_otp_delivery_total lỗi: ${String(err)}`,
      );
    }
  }
}
