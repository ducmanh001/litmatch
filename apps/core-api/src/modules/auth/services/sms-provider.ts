import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Cổng gửi SMS — implementation thật (Twilio/SNS/nhà mạng) cắm vào ở giai đoạn sau. */
export abstract class SmsProvider {
  abstract send(phone: string, message: string): Promise<void>;
}

/**
 * Provider cho dev/test: in OTP ra log thay vì gửi SMS thật.
 * Chặn cứng ở production — bootstrap fail ngay thay vì âm thầm không gửi được SMS.
 */
@Injectable()
export class DevSmsProvider extends SmsProvider implements OnApplicationBootstrap {
  private readonly logger = new Logger(DevSmsProvider.name);

  constructor(private readonly config: ConfigService) {
    super();
  }

  onApplicationBootstrap(): void {
    if (this.config.get<string>('NODE_ENV') === 'production') {
      throw new Error('DevSmsProvider không được dùng ở production — cấu hình SmsProvider thật trước khi deploy');
    }
  }

  async send(phone: string, message: string): Promise<void> {
    const masked = phone.slice(0, 4) + '****' + phone.slice(-2);
    this.logger.warn(`[DEV-ONLY SMS] tới ${masked}: ${message}`);
  }
}
