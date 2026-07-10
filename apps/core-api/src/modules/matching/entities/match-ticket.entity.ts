import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn, VersionColumn } from 'typeorm';

import { Gender } from '../../user';

export enum MatchType {
  Soul = 'soul',
  Voice = 'voice',
}

export enum MatchTicketStatus {
  Queued = 'queued',
  Matched = 'matched',
  Confirmed = 'confirmed',
  Expired = 'expired',
  Cancelled = 'cancelled',
}

/** Tiêu chí lọc đối phương do user chọn — KHÔNG phải thuộc tính của chính user (đó là ownGender/ownAge). */
export interface MatchCriteria {
  genderPref: Gender.Male | Gender.Female | 'any';
  minAge: number;
  maxAge: number;
}

/**
 * Đại diện 1 yêu cầu ghép — state machine `queued → matched → confirmed → expired/cancelled`
 * (docs/03 § 3.8.B). Tách khỏi queue store (Redis) để tránh trạng thái mập mờ khi 2 sự kiện
 * (cancel + matched) đến gần như đồng thời (docs/10 § 10.2). `version` = optimistic lock vì
 * nhiều actor sửa cùng lúc: matcher worker, user cancel, sweeper hết hạn.
 */
@Entity({ name: 'match_tickets' })
export class MatchTicket {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_match_tickets_user')
  @Column({ type: 'uuid' })
  userId!: string;

  /** Unique ở DB (docs/05 § 5.10) — retry cùng key trả lại đúng ticket cũ, không tạo hàng thứ 2. */
  @Column({ length: 255 })
  idempotencyKey!: string;

  /** SHA-256 canonical client payload; scoped by user through the DB unique index. */
  @Column({ type: 'char', length: 64 })
  requestHash!: string;

  @Column({ type: 'varchar', length: 16 })
  matchType!: MatchType;

  @Column({ type: 'varchar', length: 16, default: MatchTicketStatus.Queued })
  status!: MatchTicketStatus;

  @Column({ type: 'varchar', length: 10 })
  region!: string;

  /** Server derive từ User.gender lúc tạo ticket — không tin client gửi lên (docs/10 § 10.0.B). */
  @Column({ type: 'varchar', length: 10 })
  ownGender!: Gender;

  /** Server derive từ User.birthDate lúc tạo ticket (docs/10 § 10.0.B). */
  @Column({ type: 'int' })
  ownAge!: number;

  @Column({ type: 'jsonb' })
  criteria!: MatchCriteria;

  @Column({ type: 'boolean', default: false })
  priority!: boolean;

  @Column({ type: 'uuid', nullable: true })
  speedupTransactionId!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  speedupAppliedAt!: Date | null;

  /** Price-policy snapshot: queue priority must not change when config is deployed later. */
  @Column({ type: 'int', nullable: true })
  priorityBoostMs!: number | null;

  @Column({ type: 'uuid', nullable: true })
  pairedTicketId!: string | null;

  @Column({ type: 'uuid', nullable: true })
  matchSessionId!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  queuedAt!: Date;

  /** Stable creation time for daily quota; queuedAt changes when a confirmed user is requeued. */
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @Column({ type: 'timestamptz' })
  expiresAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  @VersionColumn()
  version!: number;
}
