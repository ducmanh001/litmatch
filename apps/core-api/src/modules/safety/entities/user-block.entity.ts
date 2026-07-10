import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn, VersionColumn } from 'typeorm';

export enum UserBlockStatus {
  Active = 'active',
  Unblocked = 'unblocked',
}

/** Current source of truth for one directed block relationship. History lives in immutable safety_audit_events. */
@Entity({ name: 'user_blocks' })
@Index('uq_user_blocks_direction', ['blockerUserId', 'blockedUserId'], { unique: true })
export class UserBlock {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_user_blocks_blocker_status')
  @Column({ type: 'uuid' })
  blockerUserId!: string;

  @Index('idx_user_blocks_blocked_status')
  @Column({ type: 'uuid' })
  blockedUserId!: string;

  @Column({ type: 'varchar', length: 16, default: UserBlockStatus.Active })
  status!: UserBlockStatus;

  @Column({ type: 'timestamptz' })
  blockedAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  unblockedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  @VersionColumn()
  version!: number;
}
