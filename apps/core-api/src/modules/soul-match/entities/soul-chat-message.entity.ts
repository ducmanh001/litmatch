import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Message của chat ẩn danh tạm thời — APPEND-ONLY (không updatedAt, không extend
 * BaseAppEntity): phòng đóng thì khoá qua API chứ KHÔNG xoá dữ liệu — giữ bằng chứng
 * cho Report/T&S về sau (docs/10 § Soul Match, docs/services/soul-match-service.md § 1).
 */
@Entity({ name: 'soul_chat_messages' })
@Index('idx_soul_chat_messages_session_seq', ['sessionId', 'seq'])
export class SoulChatMessage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /**
   * Thứ tự tăng dần DB cấp (bigint identity) cho cursor keyset — không dùng createdAt
   * làm cursor (2 message cùng mili-giây làm trùng/mất dòng khi phân trang).
   * bigint → TypeORM đọc về string.
   */
  @Column({ type: 'bigint', generated: 'increment', update: false })
  seq!: string;

  @Column({ type: 'uuid' })
  sessionId!: string;

  @Column({ type: 'uuid' })
  senderUserId!: string;

  @Column({ type: 'text' })
  content!: string;

  /** Prefix `soul:msg:{userId}:{key}` — unique DB, client retry không nhân đôi message. */
  @Column({ type: 'varchar', length: 255 })
  idempotencyKey!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
