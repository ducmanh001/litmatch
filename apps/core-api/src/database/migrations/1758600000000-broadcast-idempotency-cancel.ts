import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Broadcast thông báo: Idempotency-Key + huỷ (ADR 0013 / C16 follow-up).
 * - `idempotency_key` + UNIQUE một phần `(actor_user_id, idempotency_key)`: bấm gửi hai lần / retry mạng cùng khoá trả LẠI
 *   broadcast đã tạo thay vì tạo bản thứ hai gửi cho hàng triệu người. Một phần vì hàng cũ không có khoá.
 * - Trạng thái `cancelled`: nới CHECK của cột `status`. Bảng chỉ có vài hàng/lần admin gửi nên đổi constraint thường (khoá ngắn).
 */
export class BroadcastIdempotencyCancel1758600000000 implements MigrationInterface {
  name = 'BroadcastIdempotencyCancel1758600000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE notification_broadcasts ADD COLUMN IF NOT EXISTS idempotency_key varchar(128) NULL',
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_notification_broadcasts_idempotency
      ON notification_broadcasts (actor_user_id, idempotency_key)
      WHERE idempotency_key IS NOT NULL
    `);
    await queryRunner.query(
      'ALTER TABLE notification_broadcasts DROP CONSTRAINT IF EXISTS notification_broadcasts_status_check',
    );
    await queryRunner.query(`
      ALTER TABLE notification_broadcasts
      ADD CONSTRAINT notification_broadcasts_status_check
      CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled'))
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Trạng thái mới không tồn tại ở schema cũ: chuyển về `failed` (đã dừng, không còn được job nhặt) trước khi siết CHECK.
    await queryRunner.query(
      `UPDATE notification_broadcasts SET status = 'failed' WHERE status = 'cancelled'`,
    );
    await queryRunner.query(
      'ALTER TABLE notification_broadcasts DROP CONSTRAINT IF EXISTS notification_broadcasts_status_check',
    );
    await queryRunner.query(`
      ALTER TABLE notification_broadcasts
      ADD CONSTRAINT notification_broadcasts_status_check
      CHECK (status IN ('queued', 'running', 'completed', 'failed'))
    `);
    await queryRunner.query(
      'DROP INDEX IF EXISTS uq_notification_broadcasts_idempotency',
    );
    await queryRunner.query(
      'ALTER TABLE notification_broadcasts DROP COLUMN IF EXISTS idempotency_key',
    );
  }
}
