import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Bài viết feed công khai toàn cục (docs/services/feed-service.md § 1) — không fanout, query
 * thẳng theo `seq` giảm dần. Soft-delete (`deletedAt`) thay vì hard-delete vì `Comment`/
 * `Reaction` còn tham chiếu `postId` và cần giữ audit.
 */
@Entity({ name: 'posts' })
@Index('idx_posts_seq', ['seq'])
export class Post {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Thứ tự tăng dần DB cấp cho cursor keyset — không dùng createdAt (docs/05 § 5.4). */
  @Column({ type: 'bigint', generated: 'increment', update: false })
  seq!: string;

  @Column({ type: 'uuid' })
  authorUserId!: string;

  @Column({ type: 'text', nullable: true })
  content!: string | null;

  /** Client tự upload ảnh ra host ngoài — backend chỉ lưu URL (không có storage/CDN ở GĐ4). */
  @Column({ type: 'varchar', length: 2048, nullable: true })
  imageUrl!: string | null;

  /** Denormalized, cập nhật ATOMIC cùng transaction insert/delete Reaction (feed-service.md § 5). */
  @Column({ type: 'int', default: 0 })
  likeCount!: number;

  /** Denormalized, cập nhật ATOMIC cùng transaction insert Comment. */
  @Column({ type: 'int', default: 0 })
  commentCount!: number;

  @Column({ type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
