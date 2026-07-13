import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export enum AvatarSlot {
  Base = 'base',
  Hair = 'hair',
  Face = 'face',
  Outfit = 'outfit',
  Accessory = 'accessory',
}

/**
 * Catalog item avatar — layer ghép hình (docs/services/avatar-service.md § 1). Giá là DATA
 * trong DB (seed ở migration, đổi bằng UPDATE/admin, KHÔNG phải env config) — server đọc lại giá
 * tại thời điểm mua, giống Gift (docs/10 § Gift). `zIndex` quyết định thứ tự ghép layer client-side.
 */
@Entity({ name: 'avatar_assets' })
@Index('idx_avatar_assets_slot_active', ['slot', 'active'])
export class AvatarAsset {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 16 })
  slot!: AvatarSlot;

  @Column({ length: 64, unique: true })
  code!: string;

  @Column({ length: 128 })
  name!: string;

  @Column({ type: 'varchar', length: 2048 })
  imageUrl!: string;

  @Column({ type: 'int' })
  zIndex!: number;

  /** 0 = item free/mặc định — claim() không cần đi qua Economy. */
  @Column({ type: 'int', default: 0 })
  priceDiamond!: number;

  @Column({ default: true })
  active!: boolean;

  @Column({ type: 'int', default: 0 })
  sortOrder!: number;
}
