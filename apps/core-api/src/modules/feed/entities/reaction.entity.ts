import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Reaction "thả tim" (docs/01 #6) — 1 loại duy nhất, không phải bảng đa loại reaction. Nguồn sự
 * thật ai đã like (toggle idempotent); `Post.likeCount` đếm atomic cùng transaction
 * (feed-service.md § 5). Mutable/xoá được — KHÔNG phải hành động nhạy cảm cần audit như Block.
 */
@Entity({ name: 'reactions' })
@Index('uq_reactions_post_user', ['postId', 'userId'], { unique: true })
export class Reaction {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  postId!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
