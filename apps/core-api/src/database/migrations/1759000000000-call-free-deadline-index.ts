import { MigrationInterface, QueryRunner } from 'typeorm';

/** Deadline range/order must use started_at, rather than scanning all active calls by updated_at. */
export class CallFreeDeadlineIndex1759000000000 implements MigrationInterface {
  public transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    const existing = (await queryRunner.query(`
      SELECT indisvalid FROM pg_index
       WHERE indexrelid = to_regclass('idx_call_sessions_voice_deadline')
    `)) as Array<{ indisvalid: boolean }>;
    if (existing[0]?.indisvalid === false) {
      await queryRunner.query(
        'DROP INDEX CONCURRENTLY idx_call_sessions_voice_deadline',
      );
    }
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_call_sessions_voice_deadline
        ON call_sessions (started_at, id)
        WHERE status = 'active' AND call_kind = 'voice_match'
          AND reconnect_started_at IS NULL AND started_at IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS idx_call_sessions_voice_deadline',
    );
  }
}
