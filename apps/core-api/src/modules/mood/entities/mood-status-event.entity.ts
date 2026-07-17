import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum MoodEventKind {
  Set = 'set',
  Clear = 'clear',
}

/**
 * Log APPEND-ONLY set/clear mood — không update/xoá dòng cũ. "Mood hiện tại" của 1 user =
 * dòng mới nhất (ORDER BY createdAt DESC LIMIT 1) mà KHÔNG phải `kind=clear` và chưa quá
 * `expiresAt` — derive khi đọc (`MoodService.getCurrentMood`), không cron dọn.
 *
 * `idempotencyKey` unique ở DB (docs/05 § 5.10) — client retry (mất mạng giữa chừng) không
 * tạo 2 dòng cho cùng 1 intent; service tự prefix theo `kind` (docs `mood.constants.ts`).
 */
@Entity({ name: 'mood_status_events' })
@Index('idx_mood_status_events_user_created', ['userId', 'createdAt'])
export class MoodStatusEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  /** NULL khi kind=Clear — không có preset cho 1 lần "tắt mood". */
  @Column({ type: 'uuid', nullable: true })
  presetId!: string | null;

  @Column({ type: 'varchar', length: 8 })
  kind!: MoodEventKind;

  /** Snapshot lúc set — NULL khi kind=Clear (không có khái niệm hết hạn cho việc tắt mood). */
  @Column({ type: 'timestamptz', nullable: true })
  expiresAt!: Date | null;

  @Column({ length: 128, unique: true })
  idempotencyKey!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
