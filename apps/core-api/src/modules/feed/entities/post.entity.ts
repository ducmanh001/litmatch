import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Audience per-post (docs/services/feed-service.md § 7, W1 plan § 3.3) — `public` hiện ở feed
 * toàn cục; `friends` chỉ hiện trên profile timeline cho bạn bè; `only_me` chỉ tác giả tự thấy.
 * Feed toàn cục KHÔNG bao giờ trộn `friends`/`only_me` (tránh phải check quan hệ bạn cho từng
 * tác giả trên 1 trang feed lớn) — 2 audience đó chỉ hiện qua `listUserTimeline` (1 tác giả/lần).
 */
export enum PostAudience {
  Public = 'public',
  Friends = 'friends',
  OnlyMe = 'only_me',
}

/**
 * Bài viết feed công khai toàn cục (docs/services/feed-service.md § 1) — không fanout, query
 * thẳng theo `seq` giảm dần. Soft-delete (`deletedAt`) thay vì hard-delete vì `Comment`/
 * `Reaction` còn tham chiếu `postId` và cần giữ audit.
 */
@Entity({ name: 'posts' })
@Index('idx_posts_seq', ['seq'])
@Index('idx_posts_author_audience_seq', ['authorUserId', 'audience', 'seq'])
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

  @Column({ type: 'varchar', length: 16, default: PostAudience.Public })
  audience!: PostAudience;

  /** NULL cho bài cũ trước W3 (migration không backfill) — chỉ bài mới bắt buộc có. */
  @Column({ type: 'varchar', length: 255, nullable: true })
  idempotencyKey!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
