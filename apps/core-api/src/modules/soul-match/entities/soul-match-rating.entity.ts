import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/** Đánh giá sau chat ẩn danh (docs/01 #1): "Thô lỗ / Nhàm chán / Thích". */
export enum SoulMatchVerdict {
  Rude = 'rude',
  Boring = 'boring',
  Like = 'like',
}

/**
 * 1 người 1 verdict cho 1 session — IMMUTABLE (đổi ý = mở đường thăm dò "like thử
 * xem bên kia like chưa rồi đổi lại" — docs/10 § Soul Match). Append-only nên không
 * extend BaseAppEntity (không có updatedAt — cùng lý do LedgerEntry).
 * Unique (sessionId, raterUserId) ở DB là idempotency tự nhiên, không cần Idempotency-Key.
 */
@Entity({ name: 'soul_match_ratings' })
@Index('uq_soul_match_ratings_session_rater', ['sessionId', 'raterUserId'], {
  unique: true,
})
export class SoulMatchRating {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  sessionId!: string;

  @Column({ type: 'uuid' })
  raterUserId!: string;

  @Column({ type: 'varchar', length: 8 })
  verdict!: SoulMatchVerdict;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
