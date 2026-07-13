import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Admin moderation queue (docs/12 § 12.7) — thêm `status` vào `reports` để moderator
 * resolve/dismiss. Backfill dữ liệu cũ = `pending` (KHÔNG phải `resolved`): những report này
 * chưa từng thực sự được review bởi ai, gán `resolved` sẽ làm sai lịch sử audit — sản phẩm
 * chưa go-live nên không có rủi ro "ngập queue" với dữ liệu thật.
 */
export class ReportStatus1753800000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE reports ADD COLUMN status varchar(16) NOT NULL DEFAULT 'pending'`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_reports_status_created_at ON reports (status, created_at)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_reports_status_created_at`,
    );
    await queryRunner.query(`ALTER TABLE reports DROP COLUMN status`);
  }
}
