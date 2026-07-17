import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * View 1 video (docs/services/short-video-service.md § 3) — unique (video, viewer) chống đếm
 * đôi, cùng pattern `story_views`. `qualified` = đã xem đủ ngưỡng thời lượng
 * (`VIDEO_QUALIFIED_VIEW_MIN_MS`) — chỉ view qualified mới cộng `Video.viewCount`. Self-view
 * KHÔNG được ghi (chặn ở `VideoService.recordView` trước khi insert).
 */
@Entity({ name: 'video_views' })
@Index('uq_video_views_video_viewer', ['videoId', 'viewerId'], { unique: true })
export class VideoView {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  videoId!: string;

  @Column({ type: 'uuid' })
  viewerId!: string;

  @Column({ type: 'int', default: 0 })
  watchTimeMs!: number;

  @Column({ type: 'boolean', default: false })
  qualified!: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
