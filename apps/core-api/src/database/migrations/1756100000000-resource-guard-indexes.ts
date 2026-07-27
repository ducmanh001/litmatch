import { MigrationInterface, QueryRunner } from 'typeorm';

/** Index cho các housekeeping/read paths đã được giới hạn batch. */
export class ResourceGuardIndexes1756100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_party_rooms_active_host_grace
        ON party_rooms (host_disconnected_at, id)
       WHERE status = 'active'
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_notifications_unread_user
        ON notifications (user_id)
       WHERE read_at IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS idx_notifications_unread_user',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS idx_party_rooms_active_host_grace',
    );
  }
}
