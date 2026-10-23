import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Hàng đợi broadcast thông báo của admin (ADR 0013). Trước đây một request nạp toàn bộ user active vào RAM rồi ghi
 * hết trong MỘT transaction — với hàng triệu user thì request treo, giữ transaction hàng phút và RAM tăng vọt.
 * Giờ request chỉ ghi một dòng ở đây; job nền duyệt user theo keyset `users.id` và ghi từng lô, với
 * `cursor_user_id` + `recipient_count` được cập nhật CÙNG transaction với lô thông báo (pod chết giữa chừng thì tick
 * sau chạy tiếp đúng chỗ, không gửi trùng, không bỏ sót).
 *
 * Không FK tới `users`: đây là bản ghi vận hành/audit của admin, không được chặn việc xoá tài khoản.
 */
export class NotificationBroadcasts1758300000000 implements MigrationInterface {
  name = 'NotificationBroadcasts1758300000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE notification_broadcasts (
        id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        actor_user_id   uuid         NOT NULL,
        title           varchar(120) NOT NULL,
        body            varchar(500) NOT NULL,
        audience        varchar(8)   NOT NULL
                        CHECK (audience IN ('all', 'vip', 'free')),
        status          varchar(16)  NOT NULL DEFAULT 'queued'
                        CHECK (status IN ('queued', 'running', 'completed', 'failed')),
        cursor_user_id  uuid         NULL,
        recipient_count integer      NOT NULL DEFAULT 0,
        failure_count   integer      NOT NULL DEFAULT 0,
        last_error      varchar(500) NULL,
        created_at      timestamptz  NOT NULL DEFAULT now(),
        started_at      timestamptz  NULL,
        completed_at    timestamptz  NULL,
        updated_at      timestamptz  NOT NULL DEFAULT now()
      )
    `);
    // Job chỉ tìm broadcast đang mở, cũ nhất trước — index một phần giữ nhỏ dù lịch sử broadcast dài.
    await queryRunner.query(`
      CREATE INDEX idx_notification_broadcasts_open
      ON notification_broadcasts (created_at, id)
      WHERE status IN ('queued', 'running')
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS notification_broadcasts');
  }
}
