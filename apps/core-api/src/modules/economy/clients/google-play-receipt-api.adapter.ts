import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DomainException } from '@litmatch/common-exceptions';

import type { CoreApiEnv } from '../../../config/env.validation';
import {
  ANDROID_PUBLISHER_API_BASE,
  ANDROID_PUBLISHER_SCOPE,
  GOOGLE_PURCHASE_STATE_PURCHASED,
} from '../economy.constants';
import { EconomyErrors } from '../economy.errors';
import { GooglePlayReceiptGateway } from '../ports/store-payment-gateways';
import type { VerifiedPurchase } from '../ports/iap-verifier';
import { getGoogleServiceAccountAccessToken } from './google-service-account';
import {
  isAbortError,
  storeApiAbortSignal,
  storeProviderUnavailable,
} from './store-api-http';

/** Google Play Developer API adapter. OAuth and HTTP stay outside EconomyService. */
@Injectable()
export class GooglePlayReceiptApiAdapter extends GooglePlayReceiptGateway {
  constructor(private readonly config: ConfigService<CoreApiEnv, true>) {
    super();
  }

  async verify(
    productId: string,
    purchaseToken: string,
  ): Promise<VerifiedPurchase> {
    let response: Response;
    try {
      const packageName = this.config.getOrThrow(
        'ECONOMY_GOOGLE_PACKAGE_NAME',
        {
          infer: true,
        },
      );
      const accessToken = await getGoogleServiceAccountAccessToken(
        this.config,
        ANDROID_PUBLISHER_SCOPE,
      );
      response = await fetch(
        `${ANDROID_PUBLISHER_API_BASE}/applications/${encodeURIComponent(packageName)}/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: storeApiAbortSignal(this.config),
        },
      );
    } catch (error) {
      if (error instanceof DomainException) throw error;
      if (isAbortError(error))
        throw storeProviderUnavailable('Google Play', 'timeout');
      throw storeProviderUnavailable('Google Play', 'không kết nối được');
    }

    if (!response.ok) {
      if (response.status >= 400 && response.status < 500) {
        throw new DomainException(
          EconomyErrors.IAP_RECEIPT_INVALID,
          `Google từ chối purchase token (${response.status})`,
          HttpStatus.BAD_REQUEST,
        );
      }
      throw storeProviderUnavailable(
        'Google Play',
        `trả HTTP ${response.status}`,
      );
    }

    let body: { purchaseState?: number; orderId?: string };
    try {
      body = (await response.json()) as {
        purchaseState?: number;
        orderId?: string;
      };
    } catch {
      throw storeProviderUnavailable(
        'Google Play',
        'trả response không hợp lệ',
      );
    }
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
}
