import { Column, Entity, Index } from 'typeorm';

import { BaseAppEntity } from '../../../common/entities/base.entity';

export enum VideoStatus {
  Uploading = 'uploading',
  Processing = 'processing',
  PendingReview = 'pending_review',
  Published = 'published',
  Removed = 'removed',
  Rejected = 'rejected',
  Failed = 'failed',
}

/**
 * Video ngắn (docs/services/short-video-service.md) — V1 hướng Momo, KHÔNG phải feed toàn cục
 * cạnh tranh TikTok. Upload qua presigned URL (`VideoStoragePort`) — body video không bao giờ
 * chạm NestJS, `storageKey` chỉ là object key trỏ tới file trên storage. `playbackUrl`/
 * `thumbnailUrl`/`durationSeconds` NULL cho tới khi transcode xong (`VideoTranscodePort`).
 * `likeCount`/`commentCount`/`viewCount` denormalized, cập nhật ATOMIC cùng transaction insert
 * dòng nguồn (cùng pattern `Post.likeCount`) — KHÔNG phải nguồn sự thật, chỉ cache đọc nhanh.
 */
@Entity({ name: 'videos' })
@Index('idx_videos_status_created', ['status', 'createdAt'])
@Index('idx_videos_author', ['authorUserId'])
export class Video extends BaseAppEntity {
  @Column({ type: 'uuid' })
  authorUserId!: string;

  @Column({ type: 'varchar', length: 16, default: VideoStatus.Uploading })
  status!: VideoStatus;

  @Column({ type: 'varchar', length: 512 })
  storageKey!: string;

  @Column({ type: 'varchar', length: 2048, nullable: true })
  playbackUrl!: string | null;

  @Column({ type: 'varchar', length: 2048, nullable: true })
  thumbnailUrl!: string | null;

  @Column({ type: 'text', nullable: true })
  caption!: string | null;

  @Column({ type: 'int', nullable: true })
  durationSeconds!: number | null;

  @Column({ type: 'int', default: 0 })
  viewCount!: number;

  @Column({ type: 'int', default: 0 })
  likeCount!: number;

  @Column({ type: 'int', default: 0 })
  commentCount!: number;

  /** NULL tới khi ranking job chạy lần đầu — fallback `sort=recent` khi NULL (short-video-service.md § 4). */
  @Column({ type: 'double precision', nullable: true })
  rankScore!: number | null;

  @Column({ type: 'varchar', length: 255, unique: true })
  idempotencyKey!: string;
}
