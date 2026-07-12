import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DomainException } from '@litmatch/common-exceptions';
import { Repository } from 'typeorm';

import { EconomyErrors } from '../economy.errors';
import { LedgerService } from './ledger.service';
import { IapProvider, IapReceipt, IapReceiptStatus } from '../entities/iap.entities';
import { LedgerTransaction } from '../entities/transaction.entity';

export type RefundOutcome = 'refunded' | 'already_refunded' | 'unknown_receipt' | 'receipt_not_credited';

/**
 * Xử lý refund/chargeback từ Apple/Google (docs/services/economy-service.md § 5) — bút toán đảo,
 * KHÔNG bao giờ sửa/xoá giao dịch gốc. Idempotent theo (provider, providerTransactionId): gọi
 * lại bao nhiêu lần (webhook retry, trùng cả webhook lẫn job quét định kỳ) cũng chỉ hoàn 1 lần.
 */
@Injectable()
export class RefundService {
  private readonly logger = new Logger(RefundService.name);

  constructor(
    @InjectRepository(IapReceipt) private readonly receiptRepo: Repository<IapReceipt>,
    @InjectRepository(LedgerTransaction) private readonly transactionRepo: Repository<LedgerTransaction>,
    private readonly ledger: LedgerService,
  ) {}

  async refundIapPurchase(
    provider: IapProvider,
    providerTransactionId: string,
    reason: string,
  ): Promise<{ outcome: RefundOutcome; transactionId?: string }> {
    const receipt = await this.receiptRepo.findOneBy({ provider, providerTransactionId });
    if (!receipt) {
      // Có thể là giao dịch của app/product khác, hoặc credit chưa kịp xử lý khi refund đến
      // gần như tức thời — job quét định kỳ sẽ bắt lại (docs § 5), không phải lỗi cần retry gấp.
      this.logger.warn(`Refund cho receipt không rõ: ${provider}:${providerTransactionId}`);
      return { outcome: 'unknown_receipt' };
    }
    if (receipt.status === IapReceiptStatus.Refunded) {
      return { outcome: 'already_refunded', transactionId: receipt.refundTransactionId ?? undefined };
    }
    if (!receipt.transactionId) {
      this.logger.error(`Receipt ${receipt.id} đã credited nhưng không có transactionId — dữ liệu lệch, cần điều tra`);
      return { outcome: 'receipt_not_credited' };
    }

    try {
      const result = await this.ledger.reverse(
        receipt.transactionId,
        `refund:${provider}:${providerTransactionId}`,
        reason,
        {
          actorUserId: null, // refund tự động từ store — không phải hành động của user (docs/06)
          outboxEventTypeOverride: 'economy.diamond.refunded',
          withinTransaction: async (manager, reversalTxn) => {
            await manager.update(
              IapReceipt,
              { id: receipt.id },
              { status: IapReceiptStatus.Refunded, refundTransactionId: reversalTxn.id },
            );
          },
        },
      );
      return { outcome: 'refunded', transactionId: result.transaction.id };
    } catch (err) {
      // Giao dịch gốc đã bị reverse trước đó (vd admin adjustment) nhưng receipt chưa kịp cập
      // nhật status — idempotent, không phải lỗi cần retry (webhook/job gọi lại nhiều lần).
      // Vẫn cần truy ra ĐÚNG transaction đã reverse nó để giữ nguyên audit trail (refundTransactionId).
      if (err instanceof DomainException && err.code === EconomyErrors.TRANSACTION_ALREADY_REVERSED) {
        const existingReversal = await this.transactionRepo.findOneBy({ reversalOf: receipt.transactionId });
        await this.receiptRepo.update(
          { id: receipt.id },
          { status: IapReceiptStatus.Refunded, refundTransactionId: existingReversal?.id ?? null },
        );
        return { outcome: 'already_refunded', transactionId: existingReversal?.id };
      }
      throw err;
    }
  }
}
