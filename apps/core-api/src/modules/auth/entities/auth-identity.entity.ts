import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

export enum AuthProvider {
  Guest = 'guest',
  Phone = 'phone',
  Google = 'google',
  Apple = 'apple',
}

/**
 * 1 cách đăng nhập của 1 user. unique(provider, providerUid) ở tầng DB —
 * 2 request đăng ký song song cùng deviceId/phone không thể tạo 2 account (docs/10 § 10.1.C).
 */
@Entity({ name: 'auth_identities' })
@Unique('uq_auth_identities_provider_uid', ['provider', 'providerUid'])
export class AuthIdentity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_auth_identities_user_id')
  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ length: 16 })
  provider!: AuthProvider;

  @Column({ length: 255 })
  providerUid!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
