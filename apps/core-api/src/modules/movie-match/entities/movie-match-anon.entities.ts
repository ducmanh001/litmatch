import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  PrimaryGeneratedColumn,
} from 'typeorm';

/** Hàng chờ ghép ẩn danh — PK userId: 1 user chỉ queue 1 lần (cùng kỹ thuật Palm Match). */
@Entity({ name: 'movie_match_queue_entries' })
export class MovieMatchQueueEntry {
  @PrimaryColumn({ type: 'uuid' })
  userId!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  queuedAt!: Date;
}

/**
 * Chat trong phiên ẩn danh — APPEND-ONLY, sống theo session (khác Friend Chat: 2 người CHƯA
 * là bạn nên không có Conversation; mutual-like xong chat dài hạn chuyển sang Tin nhắn).
 * DTO trả vai trò tương đối `me|partner`, KHÔNG lộ senderUserId (ẩn danh tới khi matched).
 */
@Entity({ name: 'movie_session_messages' })
@Index('idx_movie_session_messages_session_seq', ['sessionId', 'seq'])
export class MovieSessionMessage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Thứ tự DB cấp cho cursor keyset — cùng lý do Message.seq (không dùng createdAt). */
  @Column({ type: 'bigint', generated: 'increment', update: false })
  seq!: string;

  @Column({ type: 'uuid' })
  sessionId!: string;

  @Column({ type: 'uuid' })
  senderUserId!: string;

  @Column({ type: 'text' })
  content!: string;

  /** Prefix `movie:msg:{userId}:{key}` — unique DB, client retry không nhân đôi. */
  @Column({ type: 'varchar', length: 255, unique: true })
  idempotencyKey!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
