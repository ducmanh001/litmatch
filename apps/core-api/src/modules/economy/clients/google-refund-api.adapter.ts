import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { CoreApiEnv } from '../../../config/env.validation';
import {
  ANDROID_PUBLISHER_API_BASE,
  ANDROID_PUBLISHER_SCOPE,
} from '../economy.constants';
import { EconomyErrors } from '../economy.errors';
import { GoogleVoidedPurchasesGateway } from '../ports/refund-gateways';
import { getGoogleServiceAccountAccessToken } from './google-service-account';
import { isAbortError, storeApiAbortSignal } from './store-api-http';

const VOIDED_PURCHASES_PAGE_SIZE = 1000;

/** Google Voided Purchases adapter; OAuth/API details stay out of refund job. */
@Injectable()
export class GoogleRefundApiAdapter extends GoogleVoidedPurchasesGateway {
  constructor(private readonly config: ConfigService<CoreApiEnv, true>) {
    super();
  }

  async findVoidedPurchaseIds(since: Date): Promise<Set<string>> {
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
        `${ANDROID_PUBLISHER_API_BASE}/applications/${encodeURIComponent(packageName)}/purchases/voidedpurchases?startTime=${since.getTime()}&maxResults=${VOIDED_PURCHASES_PAGE_SIZE}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: storeApiAbortSignal(this.config),
        },
      );
    } catch (error) {
      throw this.unavailable(isAbortError(error) ? 'timeout' : 'network error');
    }
    if (!response.ok) throw this.unavailable(`HTTP ${response.status}`);
    try {
      const body = (await response.json()) as {
        voidedPurchases?: Array<{ orderId?: string }>;
      };
      return new Set(
        (body.voidedPurchases ?? [])
          .map((purchase) => purchase.orderId)
          .filter((orderId): orderId is string => Boolean(orderId)),
      );
    } catch {
      throw this.unavailable('invalid response');
    }
  }

  private unavailable(reason: string): ServiceUnavailableException {
    return new ServiceUnavailableException(
      `${EconomyErrors.IAP_PROVIDER_UNAVAILABLE}: Google voided purchases API ${reason}`,
    );
  }
}
