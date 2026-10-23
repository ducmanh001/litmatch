import { MigrationInterface, QueryRunner } from 'typeorm';

/** Rolling upgrade: nullable leases do not change existing call lifecycle behavior. */
export class CallWorkerClaims1759150000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE call_sessions
      ADD COLUMN timer_claim_until timestamptz,
      ADD COLUMN cleanup_claim_until timestamptz`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE call_sessions
      DROP COLUMN cleanup_claim_until,
      DROP COLUMN timer_claim_until`);
  }
}
