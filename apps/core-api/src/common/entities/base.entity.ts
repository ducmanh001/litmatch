import { CreateDateColumn, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * Khung chung cho entity nghiệp vụ: uuid PK + cặp timestamp (docs/05 § 5.3, § 5.6).
 * OPT-IN, không ép: entity có PK nghiệp vụ riêng (vd Wallet.userId) hoặc bảng
 * append-only không có updatedAt (vd LedgerEntry) thì KHÔNG extend — tự khai cột.
 */
export abstract class BaseAppEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
