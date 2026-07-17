import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/** Reaction "thả tim" cho video — 1 loại duy nhất, toggle idempotent, sở hữu riêng bởi `short-video`. */
@Entity({ name: 'video_reactions' })
@Index('uq_video_reactions_video_user', ['videoId', 'userId'], { unique: true })
export class VideoReaction {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  videoId!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
