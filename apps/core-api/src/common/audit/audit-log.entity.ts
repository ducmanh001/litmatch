import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Log hành động nhạy cảm của admin/moderator (docs/06 dòng 13, docs/05 dòng 96) — append-only
 * tuyệt đối, DB trigger chặn UPDATE/DELETE (migration 1753700000000, cùng pattern
 * `forbid_ledger_entry_mutation`). Không có method update/delete nào ở service layer —
 * bất biến ngay từ API, không chỉ ở DB.
 */
@Entity({ name: 'admin_audit_logs' })
export class AdminAuditLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_admin_audit_logs_actor')
  @Column({ type: 'uuid' })
  actorUserId!: string;

  /** vd 'user.banned', 'user.unbanned' — namespace tự do, không phải mã lỗi DomainException. */
  @Column({ type: 'varchar', length: 100 })
  action!: string;

  @Column({ type: 'varchar', length: 50 })
  targetType!: string;

  @Index('idx_admin_audit_logs_target')
  @Column({ type: 'varchar', length: 128 })
  targetId!: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
