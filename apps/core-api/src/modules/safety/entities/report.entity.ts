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
export class Report {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  reporterUserId!: string;

  @Column({ type: 'uuid' })
  targetUserId!: string;

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
