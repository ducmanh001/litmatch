import { Column, Entity, PrimaryColumn } from 'typeorm';

import { MatchType } from './match-ticket.entity';

/**
 * Quota miễn phí của user đã đăng ký theo ngày UTC và loại match.
 * Guest vẫn dùng GuestMatchQuotaService với ba identity HMAC chống farm.
 */
@Entity({ name: 'match_daily_quotas' })
export class MatchDailyQuota {
  @PrimaryColumn({ type: 'uuid' })
  userId!: string;

  @PrimaryColumn({ type: 'date' })
  quotaDate!: string;

  @PrimaryColumn({ type: 'varchar', length: 8 })
  matchType!: MatchType;

  @Column({ type: 'int', default: 0 })
  count!: number;

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt!: Date;
}
