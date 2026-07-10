import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

import { VipTier } from './wallet.entity';

/** Gói VIP mua bằng diamond — giá/thời hạn ở DB, không hardcode (docs/05 § 5.1). */
@Entity({ name: 'vip_plans' })
export class VipPlan {
  @PrimaryColumn({ length: 64 })
  id!: string;

  @Column({ type: 'varchar', length: 16 })
  tier!: VipTier;

  @Column({ type: 'int' })
  days!: number;

  @Column({ type: 'bigint' })
  priceDiamond!: string;

  @Column({ default: true })
  active!: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
