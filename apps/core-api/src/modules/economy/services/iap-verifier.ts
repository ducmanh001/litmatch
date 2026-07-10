import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DomainException } from '@litmatch/common-exceptions';
import { SignJWT, importPKCS8 } from 'jose';

import { EconomyErrors } from '../economy.errors';
import { IapProvider } from '../entities/iap.entities';

export interface VerifiedPurchase {
  providerTransactionId: string;
}

/**
 * Verify receipt/purchase token Ở SERVER (docs/10 § Economy — không tin client).
 * Chọn implementation qua env ECONOMY_IAP_VERIFIER: 'dev' (local/test) | 'store' (sandbox/production).
 */
export abstract class IapVerifier {
  abstract verify(provider: IapProvider, payload: Record<string, unknown>, productId: string): Promise<VerifiedPurchase>;
}

/** Dev/test: nhận devTransactionId giả — chặn cứng ở production, giống DevSmsProvider. */
@Injectable()
export class DevIapVerifier extends IapVerifier implements OnApplicationBootstrap {
  private readonly logger = new Logger(DevIapVerifier.name);

  constructor(private readonly config: ConfigService) {
    super();
  }

  onApplicationBootstrap(): void {
    if (this.config.get<string>('NODE_ENV') === 'production') {
      throw new Error('DevIapVerifier không được dùng ở production — set ECONOMY_IAP_VERIFIER=store');
    }
  }

  async verify(provider: IapProvider, payload: Record<string, unknown>): Promise<VerifiedPurchase> {
    const devId = payload['devTransactionId'];
    if (typeof devId !== 'string' || devId.length < 4) {
      throw new DomainException(EconomyErrors.IAP_RECEIPT_INVALID, 'devTransactionId không hợp lệ', 400);
    }
    this.logger.warn(`[DEV-ONLY IAP] chấp nhận receipt giả ${provider}:${devId}`);
    return { providerTransactionId: devId };
  }
}

/**
 * Sandbox/production: Apple verifyReceipt (shared secret) + Google Play Developer API
 * (service account JWT). Cấu hình đủ credential trước khi bật (ECONOMY_APPLE_*, ECONOMY_GOOGLE_*).
 */
@Injectable()
export class StoreIapVerifier extends IapVerifier {
  constructor(private readonly config: ConfigService) {
    super();
  }

  async verify(provider: IapProvider, payload: Record<string, unknown>, productId: string): Promise<VerifiedPurchase> {
    if (provider === IapProvider.Apple) return this.verifyApple(payload, productId);
    return this.verifyGoogle(payload, productId);
  }

  private async verifyApple(payload: Record<string, unknown>, productId: string): Promise<VerifiedPurchase> {
    const receipt = payload['receiptData'];
    if (typeof receipt !== 'string') {
      throw new DomainException(EconomyErrors.IAP_RECEIPT_INVALID, 'Thiếu receiptData', 400);
    }
    const sharedSecret = this.config.getOrThrow<string>('ECONOMY_APPLE_SHARED_SECRET');

    // verifyReceipt: thử production trước, 21007 → receipt sandbox → thử lại endpoint sandbox (quy tắc Apple)
    let body = await this.postAppleVerify('https://buy.itunes.apple.com/verifyReceipt', receipt, sharedSecret);
    if (body.status === 21007) {
      body = await this.postAppleVerify('https://sandbox.itunes.apple.com/verifyReceipt', receipt, sharedSecret);
    }
    if (body.status !== 0) {
      throw new DomainException(EconomyErrors.IAP_RECEIPT_INVALID, `Apple từ chối receipt (status ${body.status})`, 400);
    }
    const purchases = (body.receipt?.in_app ?? []) as Array<{ product_id: string; transaction_id: string }>;
    const match = purchases.find((p) => p.product_id === productId);
    if (!match) {
      throw new DomainException(EconomyErrors.IAP_RECEIPT_INVALID, 'Receipt không chứa product này', 400);
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
    });
    return (await res.json()) as { status: number; receipt?: { in_app?: unknown[] } };
  }

  private async verifyGoogle(payload: Record<string, unknown>, productId: string): Promise<VerifiedPurchase> {
    const purchaseToken = payload['purchaseToken'];
    if (typeof purchaseToken !== 'string') {
      throw new DomainException(EconomyErrors.IAP_RECEIPT_INVALID, 'Thiếu purchaseToken', 400);
    }
    const packageName = this.config.getOrThrow<string>('ECONOMY_GOOGLE_PACKAGE_NAME');
    const accessToken = await this.googleAccessToken();

    const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(packageName)}/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) {
      throw new DomainException(EconomyErrors.IAP_RECEIPT_INVALID, `Google từ chối purchase token (${res.status})`, 400);
    }
    const body = (await res.json()) as { purchaseState?: number; orderId?: string };
    if (body.purchaseState !== 0 || !body.orderId) {
      throw new DomainException(EconomyErrors.IAP_RECEIPT_INVALID, 'Purchase chưa ở trạng thái purchased', 400);
    }
    return { providerTransactionId: body.orderId };
  }

  private async googleAccessToken(): Promise<string> {
    const email = this.config.getOrThrow<string>('ECONOMY_GOOGLE_SA_EMAIL');
    const privateKeyPem = this.config.getOrThrow<string>('ECONOMY_GOOGLE_SA_PRIVATE_KEY').replace(/\\n/g, '\n');
    const key = await importPKCS8(privateKeyPem, 'RS256');
    const assertion = await new SignJWT({ scope: 'https://www.googleapis.com/auth/androidpublisher' })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer(email)
      .setAudience('https://oauth2.googleapis.com/token')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(key);

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
    });
    if (!res.ok) throw new Error(`Google OAuth lỗi ${res.status}`);
    const body = (await res.json()) as { access_token: string };
    return body.access_token;
  }
}
