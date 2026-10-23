import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

import {
  HttpStatus,
  Injectable,
  Logger,
  OnModuleInit,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DomainException } from '@litmatch/common-exceptions';
import { IsNull, LessThan, MoreThan, Repository } from 'typeorm';

import type { CoreApiEnv } from '../../../config/env.validation';
import { OTP_CODE_DIGITS, OTP_RATE_WINDOW_MS } from '../auth.constants';
import { AuthErrors } from '../auth.errors';
import { PhoneOtp } from '../entities/phone-otp.entity';
import { OtpSenderPort } from '../ports/otp-sender.port';
import { AuthMetrics } from './auth.metrics';

@Injectable()
export class OtpService implements OnModuleInit {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    @InjectRepository(PhoneOtp) private readonly otpRepo: Repository<PhoneOtp>,
    private readonly config: ConfigService<CoreApiEnv, true>,
    private readonly sender: OtpSenderPort,
    @Optional() private readonly metrics?: AuthMetrics,
  ) {}

  onModuleInit(): void {
    const enabled = this.config.getOrThrow('AUTH_PHONE_OTP_ENABLED', {
      infer: true,
    });
    const delivery = this.config.getOrThrow('AUTH_OTP_DELIVERY', {
      infer: true,
    });
    if (
      enabled &&
      delivery === 'response' &&
      this.config.getOrThrow('NODE_ENV', { infer: true }) === 'production'
    ) {
      this.logger.error(
        'AUTH_OTP_DELIVERY=response trong production: mã OTP nằm trong response HTTP nên ai biết số điện thoại ' +
          'cũng đăng nhập được. Chỉ chấp nhận cho stack e2e dùng một lần; đặt AUTH_OTP_DELIVERY=sms-http (ADR 0013).',
      );
    }
  }

  /**
   * Rate limit theo SỐ ĐIỆN THOẠI ở server (docs/10 § 10.1.H — limit chỉ ở FE là vô nghĩa);
   * throttler theo IP đặt thêm ở controller.
   */
  async requestOtp(
    phone: string,
  ): Promise<{ code?: string; ttlSeconds: number }> {
    const delivery = this.config.getOrThrow('AUTH_OTP_DELIVERY', {
      infer: true,
    });
    if (delivery === 'disabled') {
      // AuthService đã chặn trước; giữ ở đây để không bao giờ sinh mã khi không có cách giao.
      throw new DomainException(
        AuthErrors.PHONE_OTP_DISABLED,
        'Đăng nhập bằng số điện thoại chưa khả dụng trên môi trường này',
        HttpStatus.FORBIDDEN,
      );
    }
    const perHour = this.config.getOrThrow('AUTH_OTP_REQUESTS_PER_HOUR', {
      infer: true,
    });
    const oneHourAgo = new Date(Date.now() - OTP_RATE_WINDOW_MS);
    const recentCount = await this.otpRepo.countBy({
      phone,
      createdAt: MoreThan(oneHourAgo),
    });
    if (recentCount >= perHour) {
      throw new DomainException(
        AuthErrors.OTP_REQUEST_RATE_LIMITED,
        'Yêu cầu OTP quá nhiều, thử lại sau',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const ttlSeconds = this.config.getOrThrow('AUTH_OTP_TTL_SECONDS', {
      infer: true,
    });
    const code = randomInt(0, 10 ** OTP_CODE_DIGITS)
      .toString()
      .padStart(OTP_CODE_DIGITS, '0');

    const newOtp = () =>
      this.otpRepo.create({
        phone,
        codeHash: this.hash(phone, code),
        expiresAt: new Date(Date.now() + ttlSeconds * 1000),
      });

    if (delivery === 'response') {
      // `response` (dev/test/e2e): OTP cũ chưa dùng bị vô hiệu — chỉ mã mới nhất có giá trị — rồi client
      // nhận mã qua response để hiển thị toast và tự điền.
      await this.otpRepo.update(
        { phone, consumedAt: IsNull() },
        { consumedAt: new Date() },
      );
      await this.otpRepo.save(newOtp());
      return { code, ttlSeconds };
    }

    // sms-http: lưu mã mới TRƯỚC nhưng CHƯA vô hiệu mã cũ — giao lỗi thì người dùng vẫn còn mã cũ dùng được.
    // Giao OK mới vô hiệu các mã CŨ HƠN (không phải "mọi mã khác": hai request song song vẫn để lại đúng mã mới
    // nhất). Bắt buộc vô hiệu sau khi giao: verify chọn mã chưa dùng mới nhất, nên mã cũ còn sống sẽ sống lại
    // ngay khi mã mới được dùng.
    const otp = await this.otpRepo.save(newOtp());
    await this.deliverBySms(otp, phone, code, ttlSeconds);
    await this.otpRepo.update(
      {
        phone,
        consumedAt: IsNull(),
        createdAt: LessThan(otp.createdAt ?? new Date()),
      },
      { consumedAt: new Date() },
    );
    return { ttlSeconds };
  }

  /**
   * Giao mã qua cổng SMS; response HTTP KHÔNG chứa mã. Giao lỗi thì vô hiệu CHÍNH mã vừa tạo (không để mã
   * hợp lệ "mồ côi"; timeout mơ hồ cũng coi là lỗi nên SMS tới muộn không dùng được — người dùng yêu cầu lại).
   * Lượt lỗi vẫn tính vào hạn mức theo số điện thoại: cổng chập chờn có thể đã gửi SMS thật, không đếm sẽ mở đường
   * bơm SMS tốn tiền. Log chỉ có `reference` và lý do do adapter soạn — không số, không nội dung, không mã.
   */
  private async deliverBySms(
    otp: PhoneOtp,
    phone: string,
    code: string,
    ttlSeconds: number,
  ): Promise<void> {
    const template = this.config.getOrThrow('AUTH_OTP_SMS_TEMPLATE', {
      infer: true,
    });
    const message = template
      .replaceAll('{code}', code)
      .replaceAll('{minutes}', String(Math.max(1, Math.ceil(ttlSeconds / 60))));
    try {
      await this.sender.send({ phone, message, reference: otp.id });
      this.metrics?.observeOtpDelivery('sent');
    } catch (error) {
      this.metrics?.observeOtpDelivery('failed');
      await this.otpRepo
        .update(
          { id: otp.id, consumedAt: IsNull() },
          { consumedAt: new Date() },
        )
        .catch(() => undefined);
      this.logger.error(
        `Gửi OTP qua SMS lỗi (reference=${otp.id}): ${error instanceof Error ? error.message : String(error)}`,
      );
      // Không dùng DomainException: nó chỉ cho 4xx. Giao mã hỏng là lỗi phụ thuộc ngoài (503).
      throw new ServiceUnavailableException(
        'Không gửi được mã OTP, thử lại sau',
      );
    }
  }

  /**
   * Xác minh OTP an toàn dưới race + brute-force:
   * - attempt đếm bằng UPDATE có điều kiện `attempt_count < max` — client song song không vượt được limit
   * - consume bằng UPDATE có điều kiện `consumed_at IS NULL` — 1 mã chỉ dùng được đúng 1 lần
   */
  async verifyOtp(phone: string, code: string): Promise<void> {
    const otp = await this.otpRepo.findOne({
      where: { phone, consumedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });
    if (!otp || otp.expiresAt < new Date()) {
      throw new DomainException(
        AuthErrors.OTP_EXPIRED,
        'OTP đã hết hạn hoặc chưa được yêu cầu',
        HttpStatus.BAD_REQUEST,
      );
    }

    const maxAttempts = this.config.getOrThrow('AUTH_OTP_MAX_ATTEMPTS', {
      infer: true,
    });
    const counted = await this.otpRepo
      .createQueryBuilder()
      .update()
      .set({ attemptCount: () => 'attempt_count + 1' })
      .where('id = :id AND attempt_count < :max AND consumed_at IS NULL', {
        id: otp.id,
        max: maxAttempts,
      })
      .execute();
    if (!counted.affected) {
      throw new DomainException(
        AuthErrors.OTP_TOO_MANY_ATTEMPTS,
        'Nhập sai quá số lần cho phép, yêu cầu mã mới',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const expected = Buffer.from(otp.codeHash, 'hex');
    const actual = Buffer.from(this.hash(phone, code), 'hex');
    if (
      expected.length !== actual.length ||
      !timingSafeEqual(expected, actual)
    ) {
      throw new DomainException(
        AuthErrors.OTP_INVALID,
        'Mã OTP không đúng',
        HttpStatus.BAD_REQUEST,
      );
    }

    const consumed = await this.otpRepo.update(
      { id: otp.id, consumedAt: IsNull() },
      { consumedAt: new Date() },
    );
    if (!consumed.affected) {
      // request song song đã consume trước — không cho dùng lại
      throw new DomainException(
        AuthErrors.OTP_INVALID,
        'Mã OTP không đúng',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private hash(phone: string, code: string): string {
    const pepper = this.config.getOrThrow('AUTH_OTP_PEPPER', { infer: true });
    return createHmac('sha256', pepper)
      .update(`${phone}:${code}`)
      .digest('hex');
  }
}
