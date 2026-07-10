import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export enum SafetyOperationKind {
  Block = 'block',
  Unblock = 'unblock',
  Report = 'report',
}

/** Durable, immutable idempotency record scoped by actor + operation + key. */
@Entity({ name: 'safety_operations' })
@Index('uq_safety_operations_actor_kind_key', ['actorUserId', 'kind', 'idempotencyKey'], { unique: true })
export class SafetyOperation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  actorUserId!: string;

  @Column({ type: 'varchar', length: 16 })
  kind!: SafetyOperationKind;

  @Column({ type: 'varchar', length: 255 })
  idempotencyKey!: string;

  @Column({ type: 'char', length: 64 })
  requestHash!: string;

  @Column({ type: 'uuid' })
  resourceId!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
