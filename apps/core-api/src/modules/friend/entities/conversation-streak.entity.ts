import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * Streak trò chuyện — 1:1 với `Conversation` (docs/services/streak-service.md). Tính on-write
 * trong transaction `sendMessage` (khoá row này FOR UPDATE — xem `StreakService.recordActivity`);
 * KHÔNG có job nào khác được ghi vào bảng này ngoài `recordActivity` (cron warning chỉ đọc +
 * ghi `lastWarningSentAt`, không bao giờ đổi `currentStreak`/`longestStreak`).
 *
 * Ngày lưu dạng `date` (không giờ) — luôn là NGÀY UTC theo giờ server, không phải giờ địa
 * phương của client (docs/06: chống spoof + tránh mơ hồ giữa 2 user khác múi giờ).
 */
@Entity({ name: 'conversation_streaks' })
export class ConversationStreak {
  @PrimaryColumn({ type: 'uuid' })
  conversationId!: string;

  @Column({ type: 'int', default: 0 })
  currentStreak!: number;

  @Column({ type: 'int', default: 0 })
  longestStreak!: number;

  /** Ngày UTC gần nhất `userLowId` gửi message trong conversation này — tăng đơn điệu. */
  @Column({ type: 'date', nullable: true })
  userLowLastActiveDate!: string | null;

  /** Ngày UTC gần nhất `userHighId` gửi message — tăng đơn điệu. */
  @Column({ type: 'date', nullable: true })
  userHighLastActiveDate!: string | null;

  /** Ngày UTC gần nhất streak được xác nhận tăng (cả 2 chiều cùng nhắn trong ngày đó). */
  @Column({ type: 'date', nullable: true })
  lastConfirmedDate!: string | null;

  /** Ngày bị lỡ đã được grace cứu — audit/idempotency, KHÔNG phải bộ đếm số lần dùng còn lại. */
  @Column({ type: 'date', nullable: true })
  graceUsedForDate!: string | null;

  /** Idempotency cho cron cảnh báo "sắp mất" — 1 cảnh báo/ngày UTC/conversation. */
  @Column({ type: 'timestamptz', nullable: true })
  lastWarningSentAt!: Date | null;
}
