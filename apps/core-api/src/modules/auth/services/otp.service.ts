import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DomainException } from '@litmatch/common-exceptions';
import { IsNull, MoreThan, Repository } from 'typeorm';

import { AuthErrors } from '../auth.errors';
import { PhoneOtp } from '../entities/phone-otp.entity';
import { SmsProvider } from './sms-provider';

@Injectable()
export class OtpService {
  constructor(
    @InjectRepository(PhoneOtp) private readonly otpRepo: Repository<PhoneOtp>,
    private readonly smsProvider: SmsProvider,
    private readonly config: ConfigService,
  ) {}

  /**
   * Rate limit theo SỐ ĐIỆN THOẠI ở server (docs/10 § 10.1.H — limit chỉ ở FE là vô nghĩa);
   * throttler theo IP đặt thêm ở controller.
   */
  async requestOtp(phone: string): Promise<{ ttlSeconds: number }> {
    const perHour = this.config.getOrThrow<number>('AUTH_OTP_REQUESTS_PER_HOUR');
    const oneHourAgo = new Date(Date.now() - 3600 * 1000);
    const recentCount = await this.otpRepo.countBy({ phone, createdAt: MoreThan(oneHourAgo) });
    if (recentCount >= perHour) {
      throw new DomainException(AuthErrors.OTP_REQUEST_RATE_LIMITED, 'Yêu cầu OTP quá nhiều, thử lại sau', 429);
    }

    const ttlSeconds = this.config.getOrThrow<number>('AUTH_OTP_TTL_SECONDS');
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');

    // OTP cũ chưa dùng của số này bị vô hiệu — chỉ mã mới nhất có giá trị
    await this.otpRepo.update({ phone, consumedAt: IsNull() }, { consumedAt: new Date() });
    await this.otpRepo.save(
      this.otpRepo.create({
        phone,
        codeHash: this.hash(phone, code),
        expiresAt: new Date(Date.now() + ttlSeconds * 1000),
      }),
    );

    await this.smsProvider.send(phone, `Ma xac thuc Litmatch cua ban: ${code}`);
    return { ttlSeconds };
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
      throw new DomainException(AuthErrors.OTP_EXPIRED, 'OTP đã hết hạn hoặc chưa được yêu cầu', 400);
    }

    const maxAttempts = this.config.getOrThrow<number>('AUTH_OTP_MAX_ATTEMPTS');
    const counted = await this.otpRepo
      .createQueryBuilder()
      .update()
      .set({ attemptCount: () => 'attempt_count + 1' })
      .where('id = :id AND attempt_count < :max AND consumed_at IS NULL', { id: otp.id, max: maxAttempts })
      .execute();
    if (!counted.affected) {
      throw new DomainException(AuthErrors.OTP_TOO_MANY_ATTEMPTS, 'Nhập sai quá số lần cho phép, yêu cầu mã mới', 429);
    }

    const expected = Buffer.from(otp.codeHash, 'hex');
    const actual = Buffer.from(this.hash(phone, code), 'hex');
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      throw new DomainException(AuthErrors.OTP_INVALID, 'Mã OTP không đúng', 400);
    }

    const consumed = await this.otpRepo.update({ id: otp.id, consumedAt: IsNull() }, { consumedAt: new Date() });
    if (!consumed.affected) {
      // request song song đã consume trước — không cho dùng lại
      throw new DomainException(AuthErrors.OTP_INVALID, 'Mã OTP không đúng', 400);
    }
  }

  private hash(phone: string, code: string): string {
    const pepper = this.config.getOrThrow<string>('AUTH_OTP_PEPPER');
    return createHmac('sha256', pepper).update(`${phone}:${code}`).digest('hex');
  }
}
