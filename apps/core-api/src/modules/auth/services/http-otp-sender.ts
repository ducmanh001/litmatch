import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { OtpSenderPort } from '../ports/otp-sender.port';

import type { CoreApiEnv } from '../../../config/env.validation';
import type { OtpSendInput } from '../ports/otp-sender.port';

/**
 * Giao OTP qua một cổng SMS HTTP (ADR 0013): `POST AUTH_OTP_SMS_HTTP_URL` với body JSON
 * `{ to, message, reference }` và `Authorization: Bearer <AUTH_OTP_SMS_HTTP_TOKEN>` nếu có token.
 * Cổng trả 2xx = đã nhận gửi. Trung lập nhà cung cấp: nối Twilio/eSMS/SpeedSMS... bằng một relay
 * mỏng ngoài hệ thống hoặc thêm adapter mới cùng `OtpSenderPort`.
 *
 * Thông điệp lỗi do adapter tự soạn và không chứa URL, số điện thoại, nội dung hay body phản hồi
 * (có thể lặp lại mã OTP), để caller log được mà không rò rỉ.
 */
@Injectable()
export class HttpOtpSender extends OtpSenderPort {
  constructor(private readonly config: ConfigService<CoreApiEnv, true>) {
    super();
  }

  async send({ phone, message, reference }: OtpSendInput): Promise<void> {
    const url = this.config.getOrThrow('AUTH_OTP_SMS_HTTP_URL', {
      infer: true,
    });
    if (url === '') throw new Error('AUTH_OTP_SMS_HTTP_URL chưa được cấu hình');
    const token = this.config.getOrThrow('AUTH_OTP_SMS_HTTP_TOKEN', {
      infer: true,
    });
    const timeoutMs = this.config.getOrThrow('AUTH_OTP_SMS_HTTP_TIMEOUT_MS', {
      infer: true,
    });

    let status: number;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token === '' ? {} : { authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify({ to: phone, message, reference }),
        signal: AbortSignal.timeout(timeoutMs),
        // Cổng SMS không được phép chuyển hướng (tránh gửi token sang host khác).
        redirect: 'error',
      });
      status = response.status;
    } catch (error) {
      const name = errorName(error);
      // `cause` giữ lỗi gốc để điều tra; OtpService chỉ log `message` (đã soạn, không chứa URL/số/mã)
      // và ném lại lỗi mới không kèm cause nên cause không bao giờ ra tới response hay log.
      throw new Error(
        name === 'TimeoutError' || name === 'AbortError'
          ? `SMS gateway timeout sau ${timeoutMs}ms`
          : 'SMS gateway không kết nối được',
        { cause: error },
      );
    }
    if (status < 200 || status >= 300) {
      throw new Error(`SMS gateway trả HTTP ${status}`);
    }
  }
}

/**
 * Tên lỗi theo duck-typing: lỗi do fetch/undici ném ra có thể thuộc realm khác (vd Jest sandbox) nên
 * `instanceof Error` không đáng tin.
 */
function errorName(error: unknown): string {
  return typeof error === 'object' && error !== null && 'name' in error
    ? String((error as { name: unknown }).name)
    : '';
}
