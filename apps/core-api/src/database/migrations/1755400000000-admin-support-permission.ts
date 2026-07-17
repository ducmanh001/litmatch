import { MigrationInterface, QueryRunner } from 'typeorm';

export class AdminSupportPermission1755400000000 implements MigrationInterface {
  name = 'AdminSupportPermission1755400000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO admin_role_permissions (role, permission, enabled) VALUES
        ('moderator', 'manage_support', true),
        ('admin', 'manage_support', true)
      ON CONFLICT (role, permission) DO NOTHING
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM admin_role_permissions WHERE permission = 'manage_support'
    `);
  }
}
