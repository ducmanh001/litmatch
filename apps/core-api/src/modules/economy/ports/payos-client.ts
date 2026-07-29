import { createHmac, timingSafeEqual } from 'node:crypto';

import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DomainException } from '@litmatch/common-exceptions';

import type { CoreApiEnv } from '../../../config/env.validation';
import { EconomyErrors } from '../economy.errors';

export interface PayosCreatePaymentLinkInput {
  orderCode: string;
  amountVnd: string;
  description: string;
  returnUrl: string;
  cancelUrl: string;
  expiresAt: Date;
}

export interface PayosCreatePaymentLinkResult {
  paymentLinkId: string;
  checkoutUrl: string;
  qrCode: string | null;
}

export interface PayosWebhookEvent {
  code: string;
  success: boolean;
  orderCode: string;
  amount: string;
  currency: string;
  paymentLinkId: string;
}

const PAYOS_CHECKOUT_BASE_URL = 'https://pay.payos.vn/web';

/** Port cho payOS: credential và checksum chỉ tồn tại server-side. */
@Injectable()
export class PayosClient {
  constructor(private readonly config: ConfigService<CoreApiEnv, true>) {}

  async createPaymentLink(
    input: PayosCreatePaymentLinkInput,
  ): Promise<PayosCreatePaymentLinkResult> {
    const { clientId, apiKey, checksumKey } = this.credentials();
    if (
      !Number.isSafeInteger(Number(input.orderCode)) ||
      !Number.isSafeInteger(Number(input.amountVnd))
    ) {
      throw new DomainException(
        EconomyErrors.PAYOS_PROVIDER_UNAVAILABLE,
        'Mã đơn hoặc số tiền payOS vượt giới hạn an toàn',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    const payload = {
      orderCode: Number(input.orderCode),
      amount: Number(input.amountVnd),
      description: input.description,
      returnUrl: input.returnUrl,
      cancelUrl: input.cancelUrl,
      expiredAt: Math.floor(input.expiresAt.getTime() / 1000),
    };
    const baseUrl = this.config.getOrThrow('PAYOS_API_BASE_URL', {
      infer: true,
    });
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/v2/payment-requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-client-id': clientId,
          'x-api-key': apiKey,
        },
        // payOS v2 nhận HMAC trong JSON body (không dùng x-checksum header).
        body: JSON.stringify({
          ...payload,
          signature: this.sign(
            {
              amount: payload.amount,
              cancelUrl: payload.cancelUrl,
              description: payload.description,
              orderCode: payload.orderCode,
              returnUrl: payload.returnUrl,
            },
            checksumKey,
          ),
        }),
        signal: AbortSignal.timeout(
          this.config.getOrThrow('PAYOS_HTTP_TIMEOUT_MS', { infer: true }),
        ),
      });
    } catch {
      // Timeout/network error là kết quả mơ hồ: payOS có thể đã commit order. Tra cứu
      // cùng orderCode trước khi báo lỗi để retry không tạo thêm payment intent.
      return this.recoverPaymentLink(
        baseUrl,
        input.orderCode,
        clientId,
        apiKey,
      );
    }
    const created = await this.readCreatedPaymentLinkResponse(response);
    if (created) return created;

    // POST có thể đã tạo link ở payOS nhưng response bị mất hoặc DB local rollback. GET theo
    // orderCode phục hồi cùng link, tránh retry tạo một checkout thứ hai cho cùng intent.
    return this.recoverPaymentLink(baseUrl, input.orderCode, clientId, apiKey);
  }

  verifyWebhook(payload: Record<string, unknown>): PayosWebhookEvent {
    const { checksumKey } = this.credentials();
    const signature = payload['signature'];
    const data = payload['data'];
    if (
      typeof signature !== 'string' ||
      !data ||
      typeof data !== 'object' ||
      Array.isArray(data) ||
      !this.matchesSignature(
        data as Record<string, unknown>,
        signature,
        checksumKey,
      )
    ) {
      throw new DomainException(
        EconomyErrors.WEBHOOK_SIGNATURE_INVALID,
        'Webhook payOS có chữ ký không hợp lệ',
        HttpStatus.UNAUTHORIZED,
      );
    }
    const event = data as Record<string, unknown>;
    const orderCode = event['orderCode'];
    const amount = event['amount'];
    const currency = event['currency'];
    const paymentLinkId = event['paymentLinkId'];
    const paymentCode = event['code'];
    if (
      !this.isIntegerLike(orderCode) ||
      !this.isIntegerLike(amount) ||
      typeof currency !== 'string' ||
      typeof paymentLinkId !== 'string' ||
      paymentLinkId.length === 0 ||
      typeof paymentCode !== 'string'
    ) {
      throw new DomainException(
        EconomyErrors.PAYOS_WEBHOOK_INVALID,
        'Webhook payOS thiếu dữ liệu thanh toán bắt buộc',
        HttpStatus.BAD_REQUEST,
      );
    }
    return {
      // payOS chỉ ký object `data`; outer `code`/`success` có thể bị sửa mà signature vẫn
      // hợp lệ. Quyết định credit bắt buộc dựa trên code nằm trong data đã HMAC-verify.
      code: paymentCode,
      success: paymentCode === '00',
      orderCode: String(orderCode),
      amount: String(amount),
      currency,
      paymentLinkId,
    };
  }

  private credentials(): {
    clientId: string;
    apiKey: string;
    checksumKey: string;
  } {
    const clientId = this.config.getOrThrow('PAYOS_CLIENT_ID', { infer: true });
    const apiKey = this.config.getOrThrow('PAYOS_API_KEY', { infer: true });
    const checksumKey = this.config.getOrThrow('PAYOS_CHECKSUM_KEY', {
      infer: true,
    });
    if (!clientId || !apiKey || !checksumKey) {
      throw new DomainException(
        EconomyErrors.PAYOS_DISABLED,
        'Nạp diamond qua payOS chưa được cấu hình',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return { clientId, apiKey, checksumKey };
  }

  private async recoverPaymentLink(
    baseUrl: string,
    orderCode: string,
    clientId: string,
    apiKey: string,
  ): Promise<PayosCreatePaymentLinkResult> {
    try {
      const response = await fetch(
        `${baseUrl}/v2/payment-requests/${encodeURIComponent(orderCode)}`,
        {
          headers: {
            'x-client-id': clientId,
            'x-api-key': apiKey,
          },
          signal: AbortSignal.timeout(
            this.config.getOrThrow('PAYOS_HTTP_TIMEOUT_MS', { infer: true }),
          ),
        },
      );
      const recovered = await this.readRecoveredPaymentLinkResponse(response);
      if (recovered) return recovered;
    } catch {
      // Chuẩn hoá lỗi dependency ở dưới; không log credential/payload thanh toán.
    }
    throw new DomainException(
      EconomyErrors.PAYOS_PROVIDER_UNAVAILABLE,
      'payOS tạm thời không thể tạo liên kết thanh toán',
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }

  private async readCreatedPaymentLinkResponse(
    response: Response,
  ): Promise<PayosCreatePaymentLinkResult | null> {
    if (!response.ok) return null;
    try {
      const body = (await response.json()) as {
        code?: string;
        data?: {
          paymentLinkId?: string;
          checkoutUrl?: string;
          qrCode?: string;
        };
      };
      const data = body.data;
      if (body.code !== '00' || !data?.paymentLinkId || !data.checkoutUrl) {
        return null;
      }
      return {
        paymentLinkId: data.paymentLinkId,
        checkoutUrl: data.checkoutUrl,
        qrCode: data.qrCode ?? null,
      };
    } catch {
      return null;
    }
  }

  private async readRecoveredPaymentLinkResponse(
    response: Response,
  ): Promise<PayosCreatePaymentLinkResult | null> {
    if (!response.ok) return null;
    try {
      const body = (await response.json()) as {
        code?: string;
        data?: {
          id?: string;
        };
      };
      const paymentLinkId = body.data?.id;
      if (body.code !== '00' || !paymentLinkId) return null;

      // GET payment request của payOS chỉ trả `data.id`, không trả checkoutUrl/qrCode.
      // URL checkout chuẩn của provider được khôi phục từ chính payment-link id đó.
      return {
        paymentLinkId,
        checkoutUrl: `${PAYOS_CHECKOUT_BASE_URL}/${encodeURIComponent(paymentLinkId)}`,
        qrCode: null,
      };
    } catch {
      return null;
    }
  }

  private matchesSignature(
    data: Record<string, unknown>,
    signature: string,
    checksumKey: string,
  ): boolean {
    const expected = this.sign(data, checksumKey);
    const left = Buffer.from(expected, 'hex');
    const right = Buffer.from(signature, 'hex');
    return left.length === right.length && timingSafeEqual(left, right);
  }

  /** Canonical format payOS: key sort tăng dần, không URI-encode value. */
  private sign(data: Record<string, unknown>, checksumKey: string): string {
    const canonical = Object.keys(data)
      .sort()
      .map((key) => `${key}=${this.stringifyValue(data[key])}`)
      .join('&');
    return createHmac('sha256', checksumKey).update(canonical).digest('hex');
  }

  private stringifyValue(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }

  private isIntegerLike(value: unknown): value is string | number {
    return (
      (typeof value === 'number' && Number.isSafeInteger(value)) ||
      (typeof value === 'string' && /^\d+$/.test(value))
    );
  }
}
