import { MigrationInterface, QueryRunner } from 'typeorm';

/** Existing ended calls are not automatically replayed; only new terminal transitions enqueue cleanup. */
export class CallCleanupRetry1758900000000 implements MigrationInterface {
  public transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE call_sessions ADD COLUMN IF NOT EXISTS cleanup_pending boolean NOT NULL DEFAULT false
    `);
    const existing = (await queryRunner.query(`
      SELECT indisvalid FROM pg_index
       WHERE indexrelid = to_regclass('idx_call_sessions_cleanup_pending')
    `)) as Array<{ indisvalid: boolean }>;
    if (existing[0]?.indisvalid === false) {
      await queryRunner.query(
        'DROP INDEX CONCURRENTLY idx_call_sessions_cleanup_pending',
      );
    }
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_call_sessions_cleanup_pending ON call_sessions (updated_at, id)
        WHERE status = 'ended' AND cleanup_pending = true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS idx_call_sessions_cleanup_pending',
    );
    await queryRunner.query(
      'ALTER TABLE call_sessions DROP COLUMN cleanup_pending',
    );
  }
}
