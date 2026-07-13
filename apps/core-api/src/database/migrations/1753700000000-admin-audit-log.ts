import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Task 0 backend (docs/12 § 12.7) — audit log cho hành động nhạy cảm của admin/moderator
 * (docs/06 dòng 13, docs/05 dòng 96: "audit log là bảng DB append-only, không phải log text").
 * Append-only tuyệt đối — cùng pattern `forbid_ledger_entry_mutation` (1752000000000-economy-ledger.ts).
 */
export class AdminAuditLog1753700000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE admin_audit_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        actor_user_id uuid NOT NULL,
        action varchar(100) NOT NULL,
        target_type varchar(50) NOT NULL,
        target_id uuid NOT NULL,
        metadata jsonb NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_admin_audit_logs_actor ON admin_audit_logs (actor_user_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_admin_audit_logs_target ON admin_audit_logs (target_id)`,
    );

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION forbid_admin_audit_log_mutation() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'admin_audit_logs la append-only — khong sua/xoa duoc (docs/06, docs/05 § 5.9)';
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_admin_audit_logs_append_only
      BEFORE UPDATE OR DELETE ON admin_audit_logs
      FOR EACH ROW EXECUTE FUNCTION forbid_admin_audit_log_mutation()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trg_admin_audit_logs_append_only ON admin_audit_logs`,
    );
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS forbid_admin_audit_log_mutation`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS admin_audit_logs`);
  }
}
