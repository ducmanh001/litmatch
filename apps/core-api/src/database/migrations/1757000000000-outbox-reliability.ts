import { MigrationInterface, QueryRunner } from 'typeorm';

/** Adds bounded-relay state without changing the original outbox history migration. */
export class OutboxReliability1757000000000 implements MigrationInterface {
  name = 'OutboxReliability1757000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE outbox_events ADD COLUMN dead_lettered_at timestamptz NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE outbox_events ADD COLUMN last_error text NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_outbox_events_relayable ON outbox_events(created_at) WHERE published_at IS NULL AND dead_lettered_at IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_outbox_events_relayable`);
    await queryRunner.query(
      `ALTER TABLE outbox_events DROP COLUMN IF EXISTS last_error`,
    );
    await queryRunner.query(
      `ALTER TABLE outbox_events DROP COLUMN IF EXISTS dead_lettered_at`,
    );
  }
}
