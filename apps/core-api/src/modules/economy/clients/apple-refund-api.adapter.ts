import {
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { CoreApiEnv } from '../../../config/env.validation';
import {
  appleServerApiBaseUrl,
  getAppleServerApiToken,
} from './apple-server-api';
import { storeApiAbortSignal, isAbortError } from './store-api-http';
import { EconomyErrors } from '../economy.errors';
import { AppleRefundGateway } from '../ports/refund-gateways';

/** Apple refund lookup adapter; refund polling business logic sees only the port. */
@Injectable()
export class AppleRefundApiAdapter extends AppleRefundGateway {
  constructor(private readonly config: ConfigService<CoreApiEnv, true>) {
    super();
  }

  async hasRefund(transactionId: string): Promise<boolean> {
    let response: Response;
    try {
      const token = await getAppleServerApiToken(this.config);
      response = await fetch(
        `${appleServerApiBaseUrl(this.config)}/inApps/v2/refund/lookup/${encodeURIComponent(transactionId)}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          signal: storeApiAbortSignal(this.config),
        },
      );
    } catch (error) {
      throw this.unavailable(isAbortError(error) ? 'timeout' : 'network error');
    }
    if (response.status === HttpStatus.NOT_FOUND) return false;
    if (!response.ok) {
      throw this.unavailable(`HTTP ${response.status}`);
    }
    try {
      const body = (await response.json()) as { signedTransactions?: string[] };
      return (body.signedTransactions?.length ?? 0) > 0;
    } catch {
      throw this.unavailable('invalid response');
    }
  }

  private unavailable(reason: string): ServiceUnavailableException {
    return new ServiceUnavailableException(
      `${EconomyErrors.IAP_PROVIDER_UNAVAILABLE}: Apple refund API ${reason}`,
    );
  }
}
