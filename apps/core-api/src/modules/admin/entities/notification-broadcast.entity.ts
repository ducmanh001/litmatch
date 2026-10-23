import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export enum BroadcastAudience {
  All = 'all',
  Vip = 'vip',
  Free = 'free',
}

export enum BroadcastStatus {
  Queued = 'queued',
  Running = 'running',
  Completed = 'completed',
  Failed = 'failed',
  Cancelled = 'cancelled',
}

/**
 * Một lần admin gửi thông báo hàng loạt (docs/services/admin-service.md). `BroadcastDispatchJob` duyệt user theo
 * keyset `users.id`; `cursorUserId` là user cuối cùng đã xử lý và được cập nhật cùng transaction với lô thông báo.
 * Dòng chỉ tồn tại để điều phối + hiển thị tiến độ — nguồn sự thật của việc đã gửi vẫn là bảng `notifications`.
 */
@Entity({ name: 'notification_broadcasts' })
@Index('idx_notification_broadcasts_open', ['createdAt', 'id'], {
  where: `"status" IN ('queued', 'running')`,
})
@Index(
  'uq_notification_broadcasts_idempotency',
  ['actorUserId', 'idempotencyKey'],
  { unique: true, where: '"idempotency_key" IS NOT NULL' },
)
export class NotificationBroadcast {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  actorUserId!: string;

  @Column({ type: 'varchar', length: 120 })
  title!: string;

  @Column({ type: 'varchar', length: 500 })
  body!: string;

  @Column({ type: 'varchar', length: 8 })
  audience!: BroadcastAudience;

  @Column({ type: 'varchar', length: 16, default: BroadcastStatus.Queued })
  status!: BroadcastStatus;

  /** Khoá do admin client gửi (header Idempotency-Key); cùng khoá + cùng nội dung → trả lại broadcast cũ. */
  @Column({ type: 'varchar', length: 128, nullable: true })
  idempotencyKey!: string | null;

  @Column({ type: 'uuid', nullable: true })
  cursorUserId!: string | null;

  @Column({ type: 'integer', default: 0 })
  recipientCount!: number;

  @Column({ type: 'integer', default: 0 })
  failureCount!: number;

  @Column({ type: 'varchar', length: 500, nullable: true })
  lastError!: string | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  startedAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  updatedAt!: Date;
}
