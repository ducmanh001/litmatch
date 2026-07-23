import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DomainException } from '@litmatch/common-exceptions';
import { IsNull, MoreThan, Repository } from 'typeorm';

import type { CoreApiEnv } from '../../../config/env.validation';
import { OTP_CODE_DIGITS, OTP_RATE_WINDOW_MS } from '../auth.constants';
import { AuthErrors } from '../auth.errors';
import { PhoneOtp } from '../entities/phone-otp.entity';

@Injectable()
export class OtpService {
  constructor(
    @InjectRepository(PhoneOtp) private readonly otpRepo: Repository<PhoneOtp>,
    private readonly config: ConfigService<CoreApiEnv, true>,
  ) {}

  /**
   * Rate limit theo SỐ ĐIỆN THOẠI ở server (docs/10 § 10.1.H — limit chỉ ở FE là vô nghĩa);
   * throttler theo IP đặt thêm ở controller.
   */
  async requestOtp(
    phone: string,
  ): Promise<{ code: string; ttlSeconds: number }> {
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

    // OTP cũ chưa dùng của số này bị vô hiệu — chỉ mã mới nhất có giá trị
    await this.otpRepo.update(
      { phone, consumedAt: IsNull() },
      { consumedAt: new Date() },
    );
    await this.otpRepo.save(
      this.otpRepo.create({
        phone,
        codeHash: this.hash(phone, code),
        expiresAt: new Date(Date.now() + ttlSeconds * 1000),
      }),
    );

    // Không gửi SMS: client nhận mã qua response để hiển thị toast và tự điền.
    return { code, ttlSeconds };
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
