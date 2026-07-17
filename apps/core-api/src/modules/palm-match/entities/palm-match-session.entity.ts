import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

import { BaseAppEntity } from '../../../common/entities/base.entity';

export enum PalmMatchSessionStatus {
  Active = 'active',
  Completed = 'completed',
}

export enum PalmMatchRating {
  Like = 'like',
  Skip = 'skip',
}

export enum PalmMatchOutcome {
  Matched = 'matched',
  NotMatched = 'not_matched',
  Expired = 'expired',
  Cancelled = 'cancelled',
}

/**
 * Snapshot của một lượt Palm Match. Sign, phần trăm và fortune được chốt một lần ở server để
 * reload/retry không thể quay lại kết quả khác. Cặp user luôn canonical `low < high`.
 */
@Entity({ name: 'palm_match_sessions' })
export class PalmMatchSession extends BaseAppEntity {
  @Column({ type: 'uuid' })
  userLowId!: string;

  @Column({ type: 'uuid' })
  userHighId!: string;

  @Column({ type: 'varchar', length: 24 })
  lowSign!: string;

  @Column({ type: 'varchar', length: 24 })
  highSign!: string;

  @Column({ type: 'smallint' })
  compatibilityPercent!: number;

  @Column({ type: 'text' })
  fortune!: string;

  @Column({ type: 'timestamptz', nullable: true })
  lowFlippedAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  highFlippedAt!: Date | null;

  @Column({ type: 'varchar', length: 8, nullable: true })
  lowRating!: PalmMatchRating | null;

  @Column({ type: 'varchar', length: 8, nullable: true })
  highRating!: PalmMatchRating | null;

  @Column({
    type: 'varchar',
    length: 16,
    default: PalmMatchSessionStatus.Active,
  })
  status!: PalmMatchSessionStatus;

  @Column({ type: 'varchar', length: 16, nullable: true })
  outcome!: PalmMatchOutcome | null;

  @Column({ type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  closedAt!: Date | null;
}

/** Hàng đợi idempotent: PK theo user ngăn hai tab enqueue hai lần. */
@Entity({ name: 'palm_match_queue_entries' })
export class PalmMatchQueueEntry {
  @PrimaryColumn({ type: 'uuid' })
  userId!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  queuedAt!: Date;
}

/**
 * Chốt DB cho bất biến một user chỉ trỏ tới một Palm session chưa dismiss. Hai partial unique
 * index trên low/high không chặn được trường hợp user nằm khác cột, nên dùng bảng participant.
 */
@Entity({ name: 'palm_match_active_participants' })
export class PalmMatchActiveParticipant {
  @PrimaryColumn({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'uuid' })
  sessionId!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
