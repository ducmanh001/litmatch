import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Refresh token lưu dạng SHA-256 hash (không bao giờ lưu plaintext).
 * `familyId` nhóm các token sinh ra từ cùng 1 lần login — phát hiện reuse
 * (token đã rotate mà bị dùng lại) thì revoke cả family.
 */
@Entity({ name: 'refresh_tokens' })
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_refresh_tokens_user_id')
  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'char', length: 64, unique: true })
  tokenHash!: string;

  @Index('idx_refresh_tokens_family_id')
  @Column({ type: 'uuid' })
  familyId!: string;

  @Column({ type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  rotatedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
