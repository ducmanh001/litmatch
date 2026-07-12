import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum TransactionType {
  IapPurchase = 'iap_purchase',
  VipPurchase = 'vip_purchase',
  MatchingSpeedup = 'matching_speedup',
  /** Billing voice call theo phút (docs/services/calling-service.md § 4). */
  CallingPerMinute = 'calling_per_minute',
  Reversal = 'reversal',
  Adjustment = 'adjustment',
}

export enum TransactionStatus {
  Completed = 'completed',
  Reversed = 'reversed',
}

/**
 * Metadata 1 giao dịch nghiệp vụ — KHÔNG chứa số tiền (số tiền nằm ở ledger_entries,
 * tránh 2 nguồn sự thật — docs/02). Mang idempotency_key unique ở DB (luật 2 AGENTS.md).
 */
@Entity({ name: 'transactions' })
export class LedgerTransaction {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 32 })
  type!: TransactionType;

  @Column({ type: 'varchar', length: 16, default: TransactionStatus.Completed })
  status!: TransactionStatus;

  @Column({ length: 255, unique: true })
  idempotencyKey!: string;

  /** SHA-256 của nội dung request — phát hiện key trùng nhưng payload khác (409). */
  @Column({ type: 'char', length: 64 })
  requestHash!: string;

  @Index('idx_transactions_actor_created')
  @Column({ type: 'uuid', nullable: true })
  actorUserId!: string | null;

  @Column({ type: 'uuid', nullable: true })
  reversalOf!: string | null;

  @Column({ type: 'jsonb', default: {} })
  metadata!: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
