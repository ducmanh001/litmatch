import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

import { MatchType } from './match-ticket.entity';

export enum MatchSessionStatus {
  Active = 'active',
  Ended = 'ended',
}

/** Tạo khi 2 MatchTicket chuyển sang `confirmed` (docs/02). */
@Entity({ name: 'match_sessions' })
export class MatchSession {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 16 })
  matchType!: MatchType;

  @Column({ type: 'uuid' })
  userAId!: string;

  @Column({ type: 'uuid' })
  userBId!: string;

  @Column({ type: 'varchar', length: 16, default: MatchSessionStatus.Active })
  status!: MatchSessionStatus;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  startedAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  endedAt!: Date | null;
}
