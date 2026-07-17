import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Streak trò chuyện (docs/services/streak-service.md, mở rộng module `friend`, W2 của
 * docs/plans/2026-07-14-plan-6-tinh-nang-social-discovery.md § 3.4). 1:1 với `conversations`.
 * - `user_low_last_active_date`/`user_high_last_active_date`: ngày UTC (server clock) gần nhất
 *   mỗi bên gửi message — tăng đơn điệu, không reset dù streak vỡ (chỉ dùng để phát hiện "cả 2
 *   chiều đã nhắn hôm nay").
 * - `last_confirmed_date`: ngày UTC gần nhất streak đã được xác nhận tăng (cả 2 chiều cùng nhắn).
 * - `grace_used_for_date`: ngày bị bỏ lỡ ĐÃ được grace cứu — đúng 1 ngày lỡ/lần, không phải tài
 *   nguyên giới hạn dùng-hết-là-thôi (xem docs/services/streak-service.md § 3 lý do không dùng
 *   config theo giờ cho biên grace).
 */
export class ConversationStreak1754200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE conversation_streaks (
        conversation_id            uuid PRIMARY KEY REFERENCES conversations(id),
        current_streak             int NOT NULL DEFAULT 0,
        longest_streak             int NOT NULL DEFAULT 0,
        user_low_last_active_date  date NULL,
        user_high_last_active_date date NULL,
        last_confirmed_date        date NULL,
        grace_used_for_date        date NULL,
        last_warning_sent_at       timestamptz NULL,
        CONSTRAINT chk_conversation_streaks_nonneg
          CHECK (current_streak >= 0 AND longest_streak >= 0)
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS conversation_streaks`);
  }
}
