import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Cột trung lập `friend` sở hữu (docs/plans/2026-07-14-plan-6-tinh-nang-social-discovery.md § 2)
 * — payload KHÁC NHAU theo `kind`, module khác (Feed cho story reply) tự đóng gói, `friend`
 * không cần biết ngữ nghĩa bên trong. `kind='story_reply'` snapshot `mediaUrl` NGAY LÚC GỬI vì
 * story chết sau 24h (`STORY_TTL_HOURS`) trong khi message sống mãi.
 */
export interface MessageAttachment {
  kind: string;
  payload: Record<string, unknown>;
}

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

  /**
   * NULL cho message thường. HTTP chỉ set được `kind='image'` (whitelist ở FriendController —
   * client gửi `imageUrl`, controller đóng gói); các kind khác (vd `story_reply`) vẫn chỉ
   * module khác set qua DI.
   */
  @Column({ type: 'jsonb', nullable: true })
  attachment!: MessageAttachment | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
