import { Column, Entity, Index } from 'typeorm';

import { BaseAppEntity } from '../../../common/entities/base.entity';

import { MatchType } from './match-ticket.entity';

export enum MatchSessionStatus {
  PendingConfirm = 'pending_confirm',
  Confirmed = 'confirmed',
  Ended = 'ended',
  Expired = 'expired',
}

/**
 * Flow mới tạo session đã confirmed ngay khi matcher tìm được cặp. `PendingConfirm` được giữ để
 * sweeper/confirm endpoint hoàn tất an toàn các session sinh ra từ phiên bản cũ.
 */
@Entity({ name: 'match_sessions' })
@Index('idx_match_sessions_status_created', ['status', 'createdAt'])
export class MatchSession extends BaseAppEntity {
  @Column({ type: 'varchar', length: 8 })
  matchType!: MatchType;

  @Column({ type: 'uuid' })
  userAId!: string;

  @Column({ type: 'uuid' })
  userBId!: string;

  @Column({ type: 'uuid' })
  ticketAId!: string;

  @Column({ type: 'uuid' })
  ticketBId!: string;

  @Column({
    type: 'varchar',
    length: 16,
    default: MatchSessionStatus.PendingConfirm,
  })
  status!: MatchSessionStatus;

  @Column({ type: 'timestamptz', nullable: true })
  confirmedAAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  confirmedBAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  endedAt!: Date | null;
}
