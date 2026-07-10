import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** OTP lưu dạng HMAC-SHA256(code, pepper) — attempt_count enforce ở server, không tin client. */
@Entity({ name: 'phone_otps' })
@Index('idx_phone_otps_phone_created', ['phone', 'createdAt'])
export class PhoneOtp {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ length: 20 })
  phone!: string;

  @Column({ type: 'char', length: 64 })
  codeHash!: string;

  @Column({ type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ type: 'int', default: 0 })
  attemptCount!: number;

  @Column({ type: 'timestamptz', nullable: true })
  consumedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
