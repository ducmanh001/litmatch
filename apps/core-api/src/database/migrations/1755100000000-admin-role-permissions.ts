import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AdminRolePermissions1755100000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE admin_role_permissions (
        role       varchar(16) NOT NULL,
        permission varchar(64) NOT NULL,
        enabled    boolean NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (role, permission),
        CONSTRAINT chk_admin_role_permissions_role
          CHECK (role IN ('moderator', 'admin'))
      )
    `);
    await queryRunner.query(`
      INSERT INTO admin_role_permissions (role, permission, enabled) VALUES
        ('moderator', 'view_users', true),
        ('moderator', 'ban_users', true),
        ('moderator', 'resolve_reports', true),
        ('moderator', 'refund_transaction', false),
        ('moderator', 'manage_gifts', false),
        ('moderator', 'manage_config', false),
        ('moderator', 'manage_rooms', true),
        ('moderator', 'manage_permissions', false),
        ('admin', 'view_users', true),
        ('admin', 'ban_users', true),
        ('admin', 'resolve_reports', true),
        ('admin', 'refund_transaction', true),
        ('admin', 'manage_gifts', true),
        ('admin', 'manage_config', true),
        ('admin', 'manage_rooms', true),
        ('admin', 'manage_permissions', true)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS admin_role_permissions`);
  }
}
