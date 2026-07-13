import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/** Comment dưới 1 post — soft-delete, chỉ tác giả xoá được (feed-service.md § 2). */
@Entity({ name: 'comments' })
@Index('idx_comments_post_seq', ['postId', 'seq'])
export class Comment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'bigint', generated: 'increment', update: false })
  seq!: string;

  @Column({ type: 'uuid' })
  postId!: string;

  @Column({ type: 'uuid' })
  authorUserId!: string;

  @Column({ type: 'text' })
  content!: string;

  @Column({ type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
