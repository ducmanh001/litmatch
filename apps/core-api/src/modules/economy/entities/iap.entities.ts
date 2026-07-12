import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

export enum IapProvider {
  Apple = 'apple',
  Google = 'google',
}

/** Catalog: product id trên store → số diamond. Giá tiền thật nằm ở store, đây chỉ là mapping. */
@Entity({ name: 'iap_products' })
export class IapProduct {
  @PrimaryColumn({ length: 128 })
  productId!: string;

  @Column({ type: 'varchar', length: 16 })
  provider!: IapProvider;

  @Column({ type: 'bigint' })
  diamonds!: string;

  @Column({ default: true })
  active!: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}

export enum IapReceiptStatus {
  Credited = 'credited',
  Refunded = 'refunded',
}

/** Receipt đã verify — nguồn đối soát với Apple/Google. Unique (provider, provider_transaction_id) chặn double-credit ở DB. */
@Entity({ name: 'iap_receipts' })
@Unique('uq_iap_receipts_provider_txn', ['provider', 'providerTransactionId'])
export class IapReceipt {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 16 })
  provider!: IapProvider;

  @Column({ length: 255 })
  providerTransactionId!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ length: 128 })
  productId!: string;

  @Column({ type: 'varchar', length: 16, default: IapReceiptStatus.Credited })
  status!: IapReceiptStatus;

  @Column({ type: 'uuid', nullable: true })
  transactionId!: string | null;

  /** Trỏ tới transaction type=reversal đã hoàn receipt này — null nếu chưa refund. */
  @Column({ type: 'uuid', nullable: true })
  refundTransactionId!: string | null;

  /** Watermark job quét backstop (IapRefundPollService) — null nghĩa là chưa từng được quét. */
  @Column({ type: 'timestamptz', nullable: true })
  refundCheckedAt!: Date | null;

  @Column({ type: 'jsonb', default: {} })
  rawPayload!: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
