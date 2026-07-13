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
 * Log report — append-only (docs/06: hành động nhạy cảm phải log audit riêng, không xoá được).
 * `trustPenaltyApplied` ghi lại CHÍNH XÁC số điểm bị trừ do report này (0 nếu bị chặn bởi
 * per-pair cooldown hoặc daily cap — docs/services/safety-service.md § 4), cho phép audit lại
 * mà không cần suy luận ngược từ cấu hình hiện tại (config có thể đổi theo thời gian).
 */
@Entity({ name: 'reports' })
@Index(['reporterUserId', 'targetUserId', 'createdAt'])
@Index(['targetUserId', 'createdAt'])
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

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
