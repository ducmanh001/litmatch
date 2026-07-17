import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Mở rộng `reports` cho video (W5, docs/services/short-video-service.md § 5) — KHÔNG đổi hành
 * vi report-user cũ: `target_type` mặc định `'user'`, `target_user_id` chỉ nới NOT NULL (mọi
 * dòng hiện có vẫn có giá trị, không backfill/đổi gì). CHECK đảm bảo đúng 1 trong 2 cột target
 * khớp `target_type`. KHÔNG FK `target_video_id` sang bảng `videos` — module `short-video` sở
 * hữu bảng đó, Safety trung lập không ràng buộc schema chéo module.
 */
export class ReportTargetVideo1754900000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE reports ADD COLUMN target_type varchar(8) NOT NULL DEFAULT 'user'`,
    );
    await queryRunner.query(
      `ALTER TABLE reports ADD COLUMN target_video_id uuid NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE reports ALTER COLUMN target_user_id DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE reports ADD CONSTRAINT chk_reports_target_type CHECK (target_type IN ('user','video'))`,
    );
    await queryRunner.query(`
      ALTER TABLE reports ADD CONSTRAINT chk_reports_target_matches_type CHECK (
        (target_type = 'user' AND target_user_id IS NOT NULL AND target_video_id IS NULL) OR
        (target_type = 'video' AND target_video_id IS NOT NULL AND target_user_id IS NULL)
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_reports_video_reporter ON reports (reporter_user_id, target_video_id)
        WHERE target_type = 'video'
    `);
    await queryRunner.query(
      `CREATE INDEX idx_reports_target_video_created ON reports (target_video_id, created_at)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_reports_target_video_created`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS uq_reports_video_reporter`);
    await queryRunner.query(
      `ALTER TABLE reports DROP CONSTRAINT IF EXISTS chk_reports_target_matches_type`,
    );
    await queryRunner.query(
      `ALTER TABLE reports DROP CONSTRAINT IF EXISTS chk_reports_target_type`,
    );
    await queryRunner.query(
      `ALTER TABLE reports ALTER COLUMN target_user_id SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE reports DROP COLUMN IF EXISTS target_video_id`,
    );
    await queryRunner.query(
      `ALTER TABLE reports DROP COLUMN IF EXISTS target_type`,
    );
  }
}
