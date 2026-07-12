import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Message chat 1-1 lâu dài — APPEND-ONLY (không updatedAt, không extend BaseAppEntity),
 * KHÔNG ẩn danh (2 bên đã unlock profile khi thành bạn — khác SoulChatMessage
 * (docs/services/friend-service.md § 2).
 */
@Entity({ name: 'messages' })
@Index('idx_messages_conversation_seq', ['conversationId', 'seq'])
export class Message {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /**
   * Thứ tự tăng dần DB cấp (bigint identity) cho cursor keyset — không dùng createdAt
   * làm cursor (2 message cùng mili-giây làm trùng/mất dòng khi phân trang).
   */
  @Column({ type: 'bigint', generated: 'increment', update: false })
  seq!: string;

  @Column({ type: 'uuid' })
  conversationId!: string;

  @Column({ type: 'uuid' })
  senderUserId!: string;

  @Column({ type: 'text' })
  content!: string;

  /** Prefix `friend:msg:{userId}:{key}` — unique DB, client retry không nhân đôi. */
  @Column({ type: 'varchar', length: 255 })
  idempotencyKey!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
