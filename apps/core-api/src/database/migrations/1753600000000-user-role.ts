import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Task 0 backend (docs/12 § 12.7) — thêm `role` (user|moderator|admin) cho RBAC. Mặc định
 * 'user' cho toàn bộ row cũ lẫn mới — KHÔNG seed admin cụ thể nào ở đây vì không biết trước
 * ai là admin thật ở từng môi trường (cùng tinh thần "không hardcode" đã áp dụng cho IAP
 * credential). Gán admin đầu tiên là việc ops chạy tay sau khi migrate:
 *
 *   UPDATE users SET role = 'admin' WHERE id = '<user-id-thật>';
 */
export class UserRole1753600000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE users ADD COLUMN role varchar(16) NOT NULL DEFAULT 'user'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE users DROP COLUMN role`);
  }
}
