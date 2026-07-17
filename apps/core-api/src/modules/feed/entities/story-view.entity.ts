import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Seen-state — unique (storyId, viewerId), chỉ tác giả truy vấn được danh sách (docs/services/
 * feed-service.md § 8). Self-view (tác giả xem story của chính mình) KHÔNG tạo dòng — không có
 * ý nghĩa "đã xem" khi chính là người đăng.
 */
@Entity({ name: 'story_views' })
export class StoryView {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  storyId!: string;

  @Column({ type: 'uuid' })
  viewerId!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
