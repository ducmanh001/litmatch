import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export enum SafetyAuditAction {
  BlockActivated = 'block.activated',
  BlockRemoved = 'block.removed',
  ReportSubmitted = 'report.submitted',
}

export enum SafetyResourceType {
  Block = 'block',
  Report = 'report',
}

/** Append-only audit log. A database trigger rejects UPDATE and DELETE. */
@Entity({ name: 'safety_audit_events' })
export class SafetyAuditEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_safety_audit_actor_created')
  @Column({ type: 'uuid' })
  actorUserId!: string;

  @Index('idx_safety_audit_subject_created')
  @Column({ type: 'uuid' })
  subjectUserId!: string;

  @Column({ type: 'varchar', length: 32 })
  action!: SafetyAuditAction;

  @Column({ type: 'varchar', length: 16 })
  resourceType!: SafetyResourceType;

  @Column({ type: 'uuid' })
  resourceId!: string;

  /** Small, server-generated policy snapshot only; evidence metadata remains on its normalized table. */
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  metadata!: Record<string, string | number | boolean | null>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
