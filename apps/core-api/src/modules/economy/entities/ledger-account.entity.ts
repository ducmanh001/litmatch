import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export enum LedgerAccountKind {
  UserWallet = 'user_wallet',
  UserEarnings = 'user_earnings',
  SystemIap = 'system_iap',
  SystemRevenue = 'system_revenue',
  SystemGiftPool = 'system_gift_pool',
  SystemPointsMint = 'system_points_mint',
  SystemAdjustment = 'system_adjustment',
}

export enum LedgerCurrency {
  Diamond = 'DIA',
  Points = 'PTS',
}

/** Tài khoản nội bộ của sổ cái. Unique (kind, user_id, currency) enforce bằng partial index ở migration. */
@Entity({ name: 'ledger_accounts' })
export class LedgerAccount {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 32 })
  kind!: LedgerAccountKind;

  @Column({ type: 'uuid', nullable: true })
  userId!: string | null;

  @Column({ type: 'varchar', length: 8, default: LedgerCurrency.Diamond })
  currency!: LedgerCurrency;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
