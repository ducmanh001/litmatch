import {
  HttpStatus,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DomainException } from '@litmatch/common-exceptions';

import type { CoreApiEnv } from '../../../config/env.validation';
import {
  ANDROID_PUBLISHER_API_BASE,
  ANDROID_PUBLISHER_SCOPE,
  APPLE_STATUS_OK,
  APPLE_STATUS_SANDBOX_RECEIPT,
  APPLE_VERIFY_RECEIPT_SANDBOX_URL,
  APPLE_VERIFY_RECEIPT_URL,
  GOOGLE_PURCHASE_STATE_PURCHASED,
} from '../economy.constants';
import { EconomyErrors } from '../economy.errors';
import { IapProvider } from '../entities/iap.entities';
import { getGoogleServiceAccountAccessToken } from '../clients/google-service-account';
import { storeApiAbortSignal } from '../clients/store-api-http';

export interface VerifiedPurchase {
  providerTransactionId: string;
}

/**
 * Verify receipt/purchase token Ở SERVER (docs/10 § Economy — không tin client).
 * Chọn implementation qua env ECONOMY_IAP_VERIFIER: 'dev' (local/test) | 'store' (sandbox/
 * production đủ credential) | 'disabled' (production subset, fail-closed).
 */
export abstract class IapVerifier {
  abstract verify(
    provider: IapProvider,
    payload: Record<string, unknown>,
    productId: string,
  ): Promise<VerifiedPurchase>;
}

/** Production subset không có store credential: từ chối trước mọi ledger side effect. */
@Injectable()
export class DisabledIapVerifier extends IapVerifier {
  async verify(
    provider: IapProvider,
    payload: Record<string, unknown>,
    productId: string,
  ): Promise<VerifiedPurchase> {
    void provider;
    void payload;
    void productId;
    throw new DomainException(
      EconomyErrors.IAP_DISABLED,
      'Nạp kim cương qua cửa hàng chưa khả dụng trên môi trường này',
      HttpStatus.FORBIDDEN,
    );
  }
}

/** Dev/test: nhận devTransactionId giả — chặn cứng ở production, giống DevSmsProvider. */
@Injectable()
export class DevIapVerifier
  extends IapVerifier
  implements OnApplicationBootstrap
{
  private readonly logger = new Logger(DevIapVerifier.name);

  constructor(private readonly config: ConfigService<CoreApiEnv, true>) {
    super();
  }

  onApplicationBootstrap(): void {
    if (
      this.config.get('NODE_ENV', { infer: true }) === 'production' &&
      this.config.getOrThrow('ECONOMY_IAP_VERIFIER', { infer: true }) === 'dev'
    ) {
      throw new Error(
        'DevIapVerifier không được dùng ở production — set ECONOMY_IAP_VERIFIER=store hoặc disabled',
      );
    }
  }

  async verify(
    provider: IapProvider,
    payload: Record<string, unknown>,
  ): Promise<VerifiedPurchase> {
    const devId = payload['devTransactionId'];
    if (typeof devId !== 'string' || devId.length < 4) {
      throw new DomainException(
        EconomyErrors.IAP_RECEIPT_INVALID,
        'devTransactionId không hợp lệ',
        HttpStatus.BAD_REQUEST,
      );
    }
    this.logger.warn(
      `[DEV-ONLY IAP] chấp nhận receipt giả ${provider}:${devId}`,
    );
    return { providerTransactionId: devId };
  }
}

/**
 * Sandbox/production: Apple verifyReceipt (shared secret) + Google Play Developer API
 * (service account JWT). Cấu hình đủ credential trước khi bật (ECONOMY_APPLE_*, ECONOMY_GOOGLE_*).
 */
@Injectable()
export class StoreIapVerifier extends IapVerifier {
  constructor(private readonly config: ConfigService<CoreApiEnv, true>) {
    super();
  }

  async verify(
    provider: IapProvider,
    payload: Record<string, unknown>,
    productId: string,
  ): Promise<VerifiedPurchase> {
    if (provider === IapProvider.Apple)
      return this.verifyApple(payload, productId);
    return this.verifyGoogle(payload, productId);
  }

  private async verifyApple(
    payload: Record<string, unknown>,
    productId: string,
  ): Promise<VerifiedPurchase> {
    const receipt = payload['receiptData'];
    if (typeof receipt !== 'string') {
      throw new DomainException(
        EconomyErrors.IAP_RECEIPT_INVALID,
        'Thiếu receiptData',
        HttpStatus.BAD_REQUEST,
      );
    }
    const sharedSecret = this.config.getOrThrow('ECONOMY_APPLE_SHARED_SECRET', {
      infer: true,
    });

    // verifyReceipt: thử production trước, receipt sandbox → thử lại endpoint sandbox (quy tắc Apple)
    let body = await this.postAppleVerify(
      APPLE_VERIFY_RECEIPT_URL,
      receipt,
      sharedSecret,
    );
    if (body.status === APPLE_STATUS_SANDBOX_RECEIPT) {
      body = await this.postAppleVerify(
        APPLE_VERIFY_RECEIPT_SANDBOX_URL,
        receipt,
        sharedSecret,
      );
    }
    if (body.status !== APPLE_STATUS_OK) {
      throw new DomainException(
        EconomyErrors.IAP_RECEIPT_INVALID,
        `Apple từ chối receipt (status ${body.status})`,
        HttpStatus.BAD_REQUEST,
      );
    }
    const purchases = (body.receipt?.in_app ?? []) as Array<{
      product_id: string;
      transaction_id: string;
    }>;
    const match = purchases.find((p) => p.product_id === productId);
    if (!match) {
      throw new DomainException(
        EconomyErrors.IAP_RECEIPT_INVALID,
        'Receipt không chứa product này',
        HttpStatus.BAD_REQUEST,
      );
    }
    return { providerTransactionId: match.transaction_id };
  }

  private async postAppleVerify(
    url: string,
    receipt: string,
    sharedSecret: string,
  ): Promise<{ status: number; receipt?: { in_app?: unknown[] } }> {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 'receipt-data': receipt, password: sharedSecret }),
      signal: storeApiAbortSignal(this.config),
    });
    if (!res.ok) throw new Error(`Apple store API lỗi ${res.status}`);
    return (await res.json()) as {
      status: number;
      receipt?: { in_app?: unknown[] };
    };
  }

  private async verifyGoogle(
    payload: Record<string, unknown>,
    productId: string,
  ): Promise<VerifiedPurchase> {
    const purchaseToken = payload['purchaseToken'];
    if (typeof purchaseToken !== 'string') {
      throw new DomainException(
        EconomyErrors.IAP_RECEIPT_INVALID,
        'Thiếu purchaseToken',
        HttpStatus.BAD_REQUEST,
      );
    }
    const packageName = this.config.getOrThrow('ECONOMY_GOOGLE_PACKAGE_NAME', {
      infer: true,
    });
    const accessToken = await this.googleAccessToken();

    const url = `${ANDROID_PUBLISHER_API_BASE}/applications/${encodeURIComponent(packageName)}/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: storeApiAbortSignal(this.config),
    });
    if (!res.ok) {
      throw new DomainException(
        EconomyErrors.IAP_RECEIPT_INVALID,
        `Google từ chối purchase token (${res.status})`,
        HttpStatus.BAD_REQUEST,
      );
    }
    const body = (await res.json()) as {
      purchaseState?: number;
      orderId?: string;
    };
    if (
      body.purchaseState !== GOOGLE_PURCHASE_STATE_PURCHASED ||
      !body.orderId
    ) {
      throw new DomainException(
        EconomyErrors.IAP_RECEIPT_INVALID,
        'Purchase chưa ở trạng thái purchased',
        HttpStatus.BAD_REQUEST,
      );
    }
    return { providerTransactionId: body.orderId };
  }

  private async googleAccessToken(): Promise<string> {
    return getGoogleServiceAccountAccessToken(
      this.config,
      ANDROID_PUBLISHER_SCOPE,
    );
  }
}
