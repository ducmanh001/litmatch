import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Đánh dấu video `failed` đã được sweeper xoá object trên storage. Trước đây sweeper chọn lại 200
 * hàng `failed` cũ nhất ở MỌI tick và không bao giờ đánh dấu xong, nên khi có > 200 video failed các
 * hàng mới hơn không bao giờ được dọn. Hàng cũ đã `failed` sẽ được dọn dần (cột NULL = chưa dọn).
 */
export class VideoStorageCleanupMarker1757800000000 implements MigrationInterface {
  name = 'VideoStorageCleanupMarker1757800000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE videos ADD COLUMN IF NOT EXISTS storage_cleaned_at timestamptz',
    );
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_videos_failed_uncleaned
        ON videos (updated_at, id)
        WHERE status = 'failed' AND storage_cleaned_at IS NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS idx_videos_failed_uncleaned');
    await queryRunner.query(
      'ALTER TABLE videos DROP COLUMN IF EXISTS storage_cleaned_at',
    );
  }
}
