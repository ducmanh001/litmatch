import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/** Comment dưới 1 video — sở hữu riêng bởi `short-video` (KHÔNG share bảng `comments` của Feed dù cùng shape). */
@Entity({ name: 'video_comments' })
@Index('idx_video_comments_video_seq', ['videoId', 'seq'])
export class VideoComment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'bigint', generated: 'increment', update: false })
  seq!: string;

  @Column({ type: 'uuid' })
  videoId!: string;

  @Column({ type: 'uuid' })
  authorUserId!: string;

  @Column({ type: 'text' })
  content!: string;

  @Column({ type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
