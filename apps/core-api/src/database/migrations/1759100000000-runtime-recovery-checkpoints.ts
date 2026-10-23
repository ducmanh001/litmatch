import { MigrationInterface, QueryRunner } from 'typeorm';

/** Additive coordination state only; no financial history is rewritten. */
export class RuntimeRecoveryCheckpoints1759100000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE runtime_job_checkpoints (
      job_key text PRIMARY KEY,
      state jsonb NOT NULL DEFAULT '{}'::jsonb,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE runtime_job_checkpoints');
  }
}
