import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DomainException } from '@litmatch/common-exceptions';

import type { CoreApiEnv } from '../../../config/env.validation';
import {
  APPLE_STATUS_OK,
  APPLE_STATUS_SANDBOX_RECEIPT,
  APPLE_VERIFY_RECEIPT_SANDBOX_URL,
  APPLE_VERIFY_RECEIPT_URL,
} from '../economy.constants';
import { EconomyErrors } from '../economy.errors';
import { AppleReceiptGateway } from '../ports/store-payment-gateways';
import type { AppleReceiptVerificationInput } from '../ports/store-payment-gateways';
import type { VerifiedPurchase } from '../ports/iap-verifier';
import {
  isAbortError,
  storeApiAbortSignal,
  storeProviderUnavailable,
} from './store-api-http';

interface AppleReceiptResponse {
  status?: number;
  receipt?: { in_app?: unknown[] };
}

interface ApplePurchase {
  product_id?: unknown;
  transaction_id?: unknown;
}

/** Apple verifyReceipt adapter. Không export HTTP details ra Economy business layer. */
@Injectable()
export class AppleReceiptApiAdapter extends AppleReceiptGateway {
  constructor(private readonly config: ConfigService<CoreApiEnv, true>) {
    super();
  }

  async verify(
    input: AppleReceiptVerificationInput,
  ): Promise<VerifiedPurchase> {
    const sharedSecret = this.config.getOrThrow('ECONOMY_APPLE_SHARED_SECRET', {
      infer: true,
    });
    let body = await this.postVerify(
      APPLE_VERIFY_RECEIPT_URL,
      input.receiptData,
      sharedSecret,
    );
    if (body.status === APPLE_STATUS_SANDBOX_RECEIPT) {
      body = await this.postVerify(
        APPLE_VERIFY_RECEIPT_SANDBOX_URL,
        input.receiptData,
        sharedSecret,
      );
    }
    if (body.status !== APPLE_STATUS_OK) {
      throw new DomainException(
        EconomyErrors.IAP_RECEIPT_INVALID,
        `Apple từ chối receipt (status ${body.status ?? 'unknown'})`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const purchases = (body.receipt?.in_app ?? []) as ApplePurchase[];
    const matching = purchases.filter(
      (purchase) =>
        purchase.product_id === input.productId &&
        typeof purchase.transaction_id === 'string' &&
        purchase.transaction_id.length > 0,
    );
    const match = input.transactionId
      ? matching.find(
          (purchase) => purchase.transaction_id === input.transactionId,
        )
      : matching.length === 1
        ? matching[0]
        : undefined;
    if (!match || typeof match.transaction_id !== 'string') {
      throw new DomainException(
        EconomyErrors.IAP_RECEIPT_INVALID,
        input.transactionId
          ? 'Receipt không chứa transactionId/product này'
          : matching.length > 1
            ? 'Receipt consumable chứa nhiều giao dịch; cần transactionId cụ thể'
            : 'Receipt không chứa product này',
        HttpStatus.BAD_REQUEST,
      );
    }
    return { providerTransactionId: match.transaction_id };
  }

  private async postVerify(
    url: string,
    receiptData: string,
    sharedSecret: string,
  ): Promise<AppleReceiptResponse> {
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          'receipt-data': receiptData,
          password: sharedSecret,
        }),
        signal: storeApiAbortSignal(this.config),
      });
    } catch (error) {
      if (isAbortError(error))
        throw storeProviderUnavailable('Apple Store', 'timeout');
      throw storeProviderUnavailable('Apple Store', 'không kết nối được');
    }
    if (!response.ok) {
      throw storeProviderUnavailable(
        'Apple Store',
        `trả HTTP ${response.status}`,
      );
    }
    try {
      return (await response.json()) as AppleReceiptResponse;
    } catch {
      throw storeProviderUnavailable(
        'Apple Store',
        'trả response không hợp lệ',
      );
    }
  }
}
