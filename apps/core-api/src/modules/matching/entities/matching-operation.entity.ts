import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export enum MatchingOperationKind {
  Speedup = 'speedup',
}

export enum MatchingOperationStatus {
  Pending = 'pending',
  Charged = 'charged',
  Applied = 'applied',
  Compensating = 'compensating',
  Compensated = 'compensated',
}

/** Durable orchestration state for side effects crossing Matching and Economy module boundaries. */
@Entity({ name: 'matching_operations' })
export class MatchingOperation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_matching_operations_user_created')
  @Column({ type: 'uuid' })
  userId!: string;

  @Index('idx_matching_operations_ticket')
  @Column({ type: 'uuid' })
  ticketId!: string;

  @Column({ type: 'varchar', length: 16 })
  kind!: MatchingOperationKind;

  @Column({ type: 'varchar', length: 255 })
  idempotencyKey!: string;

  @Column({ type: 'char', length: 64 })
  requestHash!: string;

  @Column({ type: 'bigint' })
  priceDiamond!: string;

  @Column({ type: 'int' })
  priorityBoostMs!: number;

  @Column({ type: 'int', default: 1 })
  policyVersion!: number;

  @Column({ type: 'varchar', length: 16, default: MatchingOperationStatus.Pending })
  status!: MatchingOperationStatus;

  @Column({ type: 'uuid', nullable: true })
  economyTransactionId!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  appliedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
