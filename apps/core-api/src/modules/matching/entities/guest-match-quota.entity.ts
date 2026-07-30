import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'guest_match_quotas' })
export class GuestMatchQuota {
  @PrimaryColumn({ type: 'date' })
  quotaDate!: string;

  /** HMAC(kind + identity); không lưu IP, fingerprint hoặc deviceId thô. */
  @PrimaryColumn({ type: 'char', length: 64 })
  keyHash!: string;

  @Column({ type: 'int', default: 0 })
  count!: number;

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt!: Date;
}
