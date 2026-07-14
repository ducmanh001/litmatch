import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum NotificationType {
  MatchConfirmed = 'match_confirmed',
  FriendMessage = 'friend_message',
  GiftReceived = 'gift_received',
  PostLiked = 'post_liked',
  PostCommented = 'post_commented',
  StreakMilestone = 'streak_milestone',
  StreakAtRisk = 'streak_at_risk',
  MatchInviteReceived = 'match_invite_received',
}

/**
 * In-app notification (docs/services/notification-service.md). `payload` chỉ chứa dữ liệu tối
 * thiểu để client tự render — KHÔNG hardcode text hiển thị ở backend, và KHÔNG bao giờ chứa
 * partnerId/nickname cho `match_confirmed` (Soul Match ẩn danh tới khi unlock — docs/06).
 */
@Entity({ name: 'notifications' })
@Index('idx_notifications_user_seq', ['userId', 'seq'])
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Thứ tự tăng dần DB cấp cho cursor keyset — không dùng createdAt (docs/05 § 5.4). */
  @Column({ type: 'bigint', generated: 'increment', update: false })
  seq!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'varchar', length: 32 })
  type!: NotificationType;

  @Column({ type: 'jsonb' })
  payload!: Record<string, unknown>;

  @Column({ type: 'timestamptz', nullable: true })
  readAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
