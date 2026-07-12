import { Column, Entity, Index } from 'typeorm';

import { BaseAppEntity } from '../../../common/entities/base.entity';

import { MatchType } from './match-ticket.entity';

export enum MatchSessionStatus {
  PendingConfirm = 'pending_confirm',
  Confirmed = 'confirmed',
  Expired = 'expired',
}

/**
 * 1 cặp đã được matcher ghép, chờ 2 bên confirm (docs/services/matching-service.md § 5).
 * Quá MATCHING_CONFIRM_TIMEOUT_SECONDS mà chưa đủ 2 confirm → sweeper expire session:
 * bên ĐÃ confirm được requeue bằng ticket MỚI, bên chưa confirm bị expire.
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

  @Column({ type: 'varchar', length: 16, default: MatchSessionStatus.PendingConfirm })
  status!: MatchSessionStatus;

  @Column({ type: 'timestamptz', nullable: true })
  confirmedAAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  confirmedBAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  endedAt!: Date | null;
}
