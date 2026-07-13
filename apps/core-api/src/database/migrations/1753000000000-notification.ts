import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Giai đoạn 4 — Notification (docs/services/notification-service.md).
 * `seq` bigserial làm cursor keyset (không dùng created_at); `payload` jsonb — dữ liệu tối thiểu
 * để client tự render.
 */
export class Notification1753000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE notifications (
        id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        seq        bigserial   NOT NULL,
        user_id    uuid        NOT NULL REFERENCES users(id),
        type       varchar(32) NOT NULL,
        payload    jsonb       NOT NULL,
        read_at    timestamptz NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_notifications_user_seq ON notifications(user_id, seq)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS notifications`);
  }
}
