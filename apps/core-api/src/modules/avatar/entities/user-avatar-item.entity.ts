import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Sở hữu item avatar — nguồn sự thật "user có item này chưa" (docs/services/avatar-service.md § 1),
 * tách khỏi `UserAvatarConfig` (đang trang bị) vì 1 user có thể sở hữu nhiều item cùng slot.
 */
@Entity({ name: 'user_avatar_items' })
@Index('uq_user_avatar_items_pair', ['userId', 'avatarAssetId'], {
  unique: true,
})
export class UserAvatarItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'uuid' })
  avatarAssetId!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  acquiredAt!: Date;
}
