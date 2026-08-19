import { Column, Entity, Index } from 'typeorm';

import { BaseAppEntity } from '../../../common/entities/base.entity';

/** Quan hệ theo dõi một chiều trên profile, độc lập với popularity gate của chat. */
@Entity({ name: 'profile_follows' })
@Index('uq_profile_follows_pair', ['followerUserId', 'followeeUserId'], {
  unique: true,
})
@Index('idx_profile_follows_followee_daily', [
  'followeeUserId',
  'active',
  'lastFollowedAt',
])
export class ProfileFollow extends BaseAppEntity {
  @Column({ type: 'uuid' })
  followerUserId!: string;

  @Column({ type: 'uuid' })
  followeeUserId!: string;

  @Column({ type: 'boolean', default: true })
  active!: boolean;

  /** Thời điểm follow gần nhất để hiển thị/audit trạng thái theo dõi. */
  @Column({ type: 'timestamptz' })
  lastFollowedAt!: Date;
}
