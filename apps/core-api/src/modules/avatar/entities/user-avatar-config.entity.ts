import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * Item đang trang bị mỗi slot (docs/services/avatar-service.md § 1) — 1 dòng/user, PK = userId
 * (không dùng `BaseAppEntity` vì PK nghiệp vụ riêng). Lazy-init lúc `getMyAvatar` lần đầu, không
 * hook vào Auth/User lúc đăng ký.
 */
@Entity({ name: 'user_avatar_configs' })
export class UserAvatarConfig {
  @PrimaryColumn({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'uuid', nullable: true })
  baseAssetId!: string | null;

  @Column({ type: 'uuid', nullable: true })
  hairAssetId!: string | null;

  @Column({ type: 'uuid', nullable: true })
  faceAssetId!: string | null;

  @Column({ type: 'uuid', nullable: true })
  outfitAssetId!: string | null;

  @Column({ type: 'uuid', nullable: true })
  accessoryAssetId!: string | null;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
