import { HttpStatus, Injectable } from '@nestjs/common';
import { DomainException } from '@litmatch/common-exceptions';

import { EconomyErrors } from '../economy.errors';
import { IapProvider } from '../entities/iap.entities';
import {
  AppleReceiptGateway,
  GooglePlayReceiptGateway,
} from '../ports/store-payment-gateways';
import { IapVerifier, VerifiedPurchase } from '../ports/iap-verifier';

/** Adapter chọn gateway của store; EconomyService chỉ thấy IapVerifier. */
@Injectable()
export class StoreIapVerifierAdapter extends IapVerifier {
  constructor(
    private readonly apple: AppleReceiptGateway,
    private readonly google: GooglePlayReceiptGateway,
  ) {
    super();
  }

  async verify(
    provider: IapProvider,
    payload: Record<string, unknown>,
    productId: string,
  ): Promise<VerifiedPurchase> {
    if (provider === IapProvider.Apple) {
      const receiptData = payload['receiptData'];
      if (typeof receiptData !== 'string' || receiptData.length === 0) {
        throw new DomainException(
          EconomyErrors.IAP_RECEIPT_INVALID,
          'Thiếu receiptData',
          HttpStatus.BAD_REQUEST,
        );
      }
      const rawTransactionId = payload['transactionId'];
      if (
        rawTransactionId !== undefined &&
        typeof rawTransactionId !== 'string'
      ) {
        throw new DomainException(
          EconomyErrors.IAP_RECEIPT_INVALID,
          'transactionId không hợp lệ',
          HttpStatus.BAD_REQUEST,
        );
      }
      const transactionId =
        typeof rawTransactionId === 'string' && rawTransactionId.length > 0
          ? rawTransactionId
          : undefined;
      return this.apple.verify({
        receiptData,
        productId,
        ...(transactionId ? { transactionId } : {}),
      });
    }

    const purchaseToken = payload['purchaseToken'];
    if (typeof purchaseToken !== 'string' || purchaseToken.length === 0) {
      throw new DomainException(
        EconomyErrors.IAP_RECEIPT_INVALID,
        'Thiếu purchaseToken',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.google.verify(productId, purchaseToken);
  }
}
