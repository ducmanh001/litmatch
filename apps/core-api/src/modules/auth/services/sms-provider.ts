import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';

/** Cổng gửi SMS — implementation thật (Twilio/SNS/nhà mạng) cắm vào ở giai đoạn sau. */
export abstract class SmsProvider {
  abstract send(phone: string, message: string): Promise<void>;
}

/**
 * Provider cho dev/test: in OTP ra log thay vì gửi SMS thật.
 * AuthModule chỉ khởi tạo provider này ngoài production.
 */
@Injectable()
export class DevSmsProvider extends SmsProvider {
  private readonly logger = new Logger(DevSmsProvider.name);

  async send(phone: string, message: string): Promise<void> {
    const masked = phone.slice(0, 4) + '****' + phone.slice(-2);
    this.logger.warn(`[DEV-ONLY SMS] tới ${masked}: ${message}`);
  }
}

/**
 * Fail-closed placeholder cho production cho tới khi tích hợp Twilio/SNS/nhà mạng.
 * Cho phép process phục vụ các flow khác, nhưng tuyệt đối không log/chấp nhận OTP giả.
 */
@Injectable()
export class UnavailableSmsProvider extends SmsProvider {
  async send(): Promise<never> {
    throw new ServiceUnavailableException('SMS provider chưa được cấu hình');
  }
}
