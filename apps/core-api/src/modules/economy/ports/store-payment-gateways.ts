import type { VerifiedPurchase } from './iap-verifier';

export interface AppleReceiptVerificationInput {
  receiptData: string;
  productId: string;
  transactionId?: string;
}

/** Port nội bộ cho Apple; HTTP/JWS/credential chỉ nằm ở adapter. */
export abstract class AppleReceiptGateway {
  abstract verify(
    input: AppleReceiptVerificationInput,
  ): Promise<VerifiedPurchase>;
}

/** Port nội bộ cho Google Play; API/OAuth chỉ nằm ở adapter. */
export abstract class GooglePlayReceiptGateway {
  abstract verify(
    productId: string,
    purchaseToken: string,
  ): Promise<VerifiedPurchase>;
}
