import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Catalog dùng product/plan id không phải UUID; audit target phải chứa đúng định danh gốc. */
export class AdminCatalogAuditTarget1755000000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE admin_audit_logs
      ALTER COLUMN target_id TYPE varchar(128)
      USING target_id::text
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE admin_audit_logs
      ALTER COLUMN target_id TYPE uuid
      USING target_id::uuid
    `);
  }
}
