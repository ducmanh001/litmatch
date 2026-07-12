import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { LedgerCurrency } from './ledger-account.entity';

export enum LedgerDirection {
  Debit = 'debit',
  Credit = 'credit',
}

/**
 * Bút toán Nợ/Có — NGUỒN SỰ THẬT DUY NHẤT của tiền (luật 2 AGENTS.md).
 * Append-only tuyệt đối: DB trigger chặn UPDATE/DELETE (migration 1752000000000).
 * amount là bigint dương — TypeORM trả về string cho bigint, xử lý bằng BigInt() khi tính toán.
 */
@Entity({ name: 'ledger_entries' })
export class LedgerEntry {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_ledger_entries_transaction')
  @Column({ type: 'uuid' })
  transactionId!: string;

  @Index('idx_ledger_entries_account_created')
  @Column({ type: 'uuid' })
  accountId!: string;

  @Column({ type: 'varchar', length: 6 })
  direction!: LedgerDirection;

  @Column({ type: 'bigint' })
  amount!: string;

  @Column({ type: 'varchar', length: 8 })
  currency!: LedgerCurrency;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
