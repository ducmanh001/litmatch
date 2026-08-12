import {
  HttpStatus,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DomainException } from '@litmatch/common-exceptions';

import type { CoreApiEnv } from '../../../config/env.validation';
import { EconomyErrors } from '../economy.errors';
import { IapProvider } from '../entities/iap.entities';

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

/** Dev/test: nhận devTransactionId giả — chặn cứng ở production như các dev-only adapter khác. */
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
