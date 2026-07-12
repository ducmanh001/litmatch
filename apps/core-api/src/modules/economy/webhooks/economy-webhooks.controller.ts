import { Body, Controller, Headers, HttpCode, HttpStatus, Logger, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import { Throttle, minutes } from '@nestjs/throttler';

import type { CoreApiEnv } from '../../../config/env.validation';
import { Public } from '../../../common/decorators/public.decorator';
import { AppleServerNotificationDto, GoogleRtdnEnvelopeDto } from '../dto/webhook.dtos';
import { IapProvider } from '../entities/iap.entities';
import { RefundService } from '../services/refund.service';
import { AppleNotificationVerifier, GoogleRtdnVerifier } from '../ports/notification-verifier';

// Notification type gây hoàn tiền (Apple App Store Server Notifications V2).
const APPLE_REFUND_NOTIFICATION_TYPES = new Set(['REFUND', 'REVOKE']);
// oneTimeProductNotification.notificationType: 1 = PURCHASED, 2 = CANCELED.
const GOOGLE_ONE_TIME_PRODUCT_CANCELED = 2;

/**
 * Webhook server-to-server từ Apple/Google báo refund/chargeback (docs/services/economy-service.md § 5).
 * KHÔNG tin payload chưa verify chữ ký (docs/10 § 10.0.B) — verifier ném lỗi 401 nếu chữ ký sai.
 * Luôn trả 200 khi đã verify xong (kể cả không tìm thấy receipt) để tránh store retry storm —
 * receipt không rõ được coi là "chưa cần xử lý ngay", job quét định kỳ sẽ bắt lại nếu thật sự bị lệch.
 */
@ApiExcludeController() // webhook nội bộ store-to-store, không phải API cho client — ẩn khỏi Swagger public
@Public()
@Controller('economy/webhooks')
export class EconomyWebhooksController {
  private readonly logger = new Logger(EconomyWebhooksController.name);

  constructor(
    private readonly refundService: RefundService,
    private readonly appleVerifier: AppleNotificationVerifier,
    private readonly googleVerifier: GoogleRtdnVerifier,
    private readonly config: ConfigService<CoreApiEnv, true>,
  ) {}

  @Post('apple')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 60, ttl: minutes(1) } })
  async appleNotification(@Body() dto: AppleServerNotificationDto): Promise<{ received: boolean }> {
    const payload = await this.appleVerifier.verify(dto.signedPayload);

    // Defense-in-depth: chain hợp lệ chỉ chứng minh "Apple ký", chưa chứng minh "ký cho app này"
    // (mọi app dùng chung 1 chain chứng chỉ Apple) — phải tự đối chiếu bundleId cấu hình.
    const expectedBundleId = this.config.getOrThrow('ECONOMY_APPLE_BUNDLE_ID', { infer: true });
    if (expectedBundleId && payload.data.bundleId !== expectedBundleId) {
      this.logger.warn(`Apple notification bundleId lạ: ${payload.data.bundleId}`);
      return { received: true };
    }

    if (!APPLE_REFUND_NOTIFICATION_TYPES.has(payload.notificationType) || !payload.data.signedTransactionInfo) {
      return { received: true }; // không phải notification refund — ack, không có gì để xử lý
    }
    const txnInfo = this.appleVerifier.decodeTransactionInfo(payload.data.signedTransactionInfo);
    await this.refundService.refundIapPurchase(
      IapProvider.Apple,
      txnInfo.transactionId,
      `apple:${payload.notificationType}${payload.subtype ? `:${payload.subtype}` : ''}`,
    );
    return { received: true };
  }

  @Post('google/rtdn')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 60, ttl: minutes(1) } })
  async googleRtdn(
    @Body() dto: GoogleRtdnEnvelopeDto,
    @Headers('authorization') authorizationHeader?: string,
  ): Promise<{ received: boolean }> {
    const notification = await this.googleVerifier.verify(dto, authorizationHeader);
    const otp = notification['oneTimeProductNotification'] as
      | { notificationType: number; purchaseToken: string; sku: string }
      | undefined;

    // docs/services/economy-service.md § 5: CANCELED KHÔNG đảm bảo nghĩa "voided" cho sản phẩm
    // one-time — refund thẳng ở đây là rủi ro đảo nhầm giao dịch hợp lệ. Chỉ log để dễ điều tra/
    // đối chiếu thời gian; nguồn refund CHÍNH THỨC & DUY NHẤT là job quét Voided Purchases API
    // (IapRefundPollService, chạy theo ECONOMY_REFUND_POLL_INTERVAL_MS) — không refund ở đây.
    if (otp?.notificationType === GOOGLE_ONE_TIME_PRODUCT_CANCELED) {
      this.logger.log(
        `Google RTDN CANCELED (tín hiệu phụ, không tự refund): sku=${otp.sku} token=${otp.purchaseToken.slice(0, 12)}…`,
      );
    }
    return { received: true };
  }
}
