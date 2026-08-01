import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cho phép một call active hồi phục sau sự cố mạng/SFU ngắn thay vì coi
 * participant_left là kết thúc ngay lập tức. Trong cửa sổ này CallTickerService
 * tạm dừng free timer/billing; quá hạn mới transition sang ended.
 */
export class CallingReconnectWindow1756500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE call_sessions
        ADD COLUMN reconnect_started_at timestamptz NULL,
        ADD COLUMN disconnected_a_at timestamptz NULL,
        ADD COLUMN disconnected_b_at timestamptz NULL
    `);
    await queryRunner.query(`
      CREATE INDEX idx_call_sessions_reconnect_started
        ON call_sessions (reconnect_started_at, id)
        WHERE status = 'active' AND reconnect_started_at IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_call_sessions_reconnect_started`,
    );
    await queryRunner.query(`
      ALTER TABLE call_sessions
        DROP COLUMN IF EXISTS reconnect_started_at,
        DROP COLUMN IF EXISTS disconnected_a_at,
        DROP COLUMN IF EXISTS disconnected_b_at
    `);
  }
}
