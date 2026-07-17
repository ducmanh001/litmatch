import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/** Story chỉ 2 audience — không có `only_me` (không có ý nghĩa cho nội dung để "khoe"). */
export enum StoryAudience {
  Public = 'public',
  Friends = 'friends',
}

/**
 * Story ephemeral (docs/services/feed-service.md § 8) — KHÁC `Post` (không soft-delete/audit):
 * hết hạn = filter lúc đọc (`expiresAt <= now()`) là nguồn sự thật; sweeper hard-delete định kỳ
 * chỉ dọn rác, không phải chốt correctness. `audience=public` hiện chưa có kênh phân phối rộng
 * hơn ring bạn bè ở W3 (Ring stories: chỉ bạn bè + mình, quyết định chốt) — cột giữ để tương
 * thích tương lai, không lộ khác biệt hành vi nào ở W3.
 */
@Entity({ name: 'stories' })
@Index('idx_stories_author_expires', ['authorUserId', 'expiresAt'])
export class Story {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  authorUserId!: string;

  @Column({ type: 'varchar', length: 2048 })
  mediaUrl!: string;

  @Column({ type: 'text', nullable: true })
  caption!: string | null;

  @Column({ type: 'varchar', length: 16, default: StoryAudience.Friends })
  audience!: StoryAudience;

  /** Snapshot lúc tạo = now + STORY_TTL_HOURS — không đổi theo config sau khi đã set. */
  @Column({ type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ length: 255, unique: true })
  idempotencyKey!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
