import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum ReportReason {
  Harassment = 'harassment',
  Spam = 'spam',
  Underage = 'underage',
  InappropriateContent = 'inappropriate_content',
  Other = 'other',
}

/**
 * Loại đối tượng bị report (W5, docs/services/short-video-service.md § 5) — mặc định `User` để
 * hành vi cũ (report user) KHÔNG đổi. `Video`: KHÔNG đụng trust score cá nhân (khác `User` — chỉ
 * đếm distinct reporter để module `short-video` tự quyết auto-hide, xem `SafetyService.reportVideo`).
 */
export enum ReportTargetType {
  User = 'user',
  Video = 'video',
}

/** Trạng thái xử lý report của moderator (docs/12 § 12.7 Admin — moderation queue). */
export enum ReportStatus {
  Pending = 'pending',
  Resolved = 'resolved',
  Dismissed = 'dismissed',
}

/**
 * Log report — append-only (docs/06: hành động nhạy cảm phải log audit riêng, không xoá được).
 * `trustPenaltyApplied` ghi lại CHÍNH XÁC số điểm bị trừ do report này (0 nếu bị chặn bởi
 * per-pair cooldown hoặc daily cap — docs/services/safety-service.md § 4), cho phép audit lại
 * mà không cần suy luận ngược từ cấu hình hiện tại (config có thể đổi theo thời gian).
 * `status` là phần DUY NHẤT được mutate trên bảng này (moderator resolve/dismiss) — mọi field
 * khác bất biến từ lúc tạo, tách biệt với audit log riêng (`admin_audit_logs`) ghi lại ai/khi nào.
 */
@Entity({ name: 'reports' })
@Index(['reporterUserId', 'targetUserId', 'createdAt'])
@Index(['targetUserId', 'createdAt'])
@Index(['status', 'createdAt'])
@Index(['targetVideoId', 'createdAt'])
export class Report {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  reporterUserId!: string;

  @Column({ length: 8, default: ReportTargetType.User })
  targetType!: ReportTargetType;

  /** NULL khi `targetType=video` — mặc định 'user' giữ hành vi cũ 100% không đổi. */
  @Column({ type: 'uuid', nullable: true })
  targetUserId!: string | null;

  /** NULL khi `targetType=user`. KHÔNG có FK sang bảng `videos` — `short-video` sở hữu bảng đó, tự validate tồn tại trước khi gọi. */
  @Column({ type: 'uuid', nullable: true })
  targetVideoId!: string | null;

  @Column({ length: 32 })
  reason!: ReportReason;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'int', default: 0 })
  trustPenaltyApplied!: number;

  @Column({ length: 16, default: ReportStatus.Pending })
  status!: ReportStatus;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
