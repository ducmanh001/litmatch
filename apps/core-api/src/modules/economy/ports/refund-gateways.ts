export abstract class AppleRefundGateway {
  abstract hasRefund(transactionId: string): Promise<boolean>;
}

export abstract class GoogleVoidedPurchasesGateway {
  abstract findVoidedPurchaseIds(since: Date): Promise<Set<string>>;
}
