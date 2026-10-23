import { MigrationInterface, QueryRunner } from 'typeorm';

const INDEXES = [
  {
    name: 'idx_transactions_reconciliation_cursor',
    sql: 'ON transactions (created_at, id)',
  },
  {
    name: 'idx_match_tickets_repair_cursor',
    sql: "ON match_tickets (enqueued_at, id) WHERE status = 'queued'",
  },
] as const;

/** Bounded keyset scans need ordered indexes, rather than a full historical sort. */
export class RecoveryCursorIndexes1759200000000 implements MigrationInterface {
  transaction = false;

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const index of INDEXES) {
      const [existing] = (await queryRunner.query(
        'SELECT indisvalid FROM pg_index WHERE indexrelid = to_regclass($1)',
        [index.name],
      )) as Array<{ indisvalid: boolean }>;
      if (existing?.indisvalid === false) {
        await queryRunner.query(`DROP INDEX CONCURRENTLY ${index.name}`);
      }
      await queryRunner.query(
        `CREATE INDEX CONCURRENTLY IF NOT EXISTS ${index.name} ${index.sql}`,
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const index of [...INDEXES].reverse())
      await queryRunner.query(`DROP INDEX IF EXISTS ${index.name}`);
  }
}
