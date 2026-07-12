import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

export enum VipTier {
  Vip = 'vip',
  Svip = 'svip',
}

/**
 * SNAPSHOT dẫn xuất từ ledger — KHÔNG phải nguồn sự thật (luật 2 AGENTS.md).
 * Chỉ LedgerService được ghi, trong cùng DB transaction với bút toán.
 * Rebuild được bất cứ lúc nào bằng EconomyService.rebuildWallet().
 * `balance` CÓ THỂ âm sau refund/chargeback (user nợ diamond — docs/services/economy-service.md § 5);
 * chống tiêu quá số dư là guard tầng ứng dụng (SELECT ... FOR UPDATE + balance - amount >= 0),
 * không phải CHECK ở DB.
 */
@Entity({ name: 'wallets' })
export class Wallet {
  @PrimaryColumn({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'bigint', default: 0 })
  balance!: string;

  @Column({ type: 'bigint', default: 0 })
  earnings!: string;

  @Column({ type: 'varchar', length: 16, nullable: true })
  vipTier!: VipTier | null;

  @Column({ type: 'timestamptz', nullable: true })
  vipExpiresAt!: Date | null;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  /** Hết hạn tự downgrade = derive khi đọc (docs/services/economy-service.md § 2). */
  get activeVipTier(): VipTier | null {
    return this.vipTier && this.vipExpiresAt && this.vipExpiresAt > new Date()
      ? this.vipTier
      : null;
  }
}
