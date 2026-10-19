import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ranking video theo HẠN TÍNH LẠI thay vì xoay vòng cả bảng (plan 2026-10-17 § 7a, ADR 0014).
 *
 * Xoay vòng theo `rank_computed_at` có chu kỳ đầy đủ = số video / lô × chu kỳ tick, nên tăng tuyến tính theo số video
 * (hàng chục triệu video không bao giờ kịp). Điểm hạng = tương tác / (1 + tuổi/decay) chỉ đổi tương đối chậm theo thời gian:
 * sai số tương đối sau Δ giờ ≈ Δ / (decay + tuổi). Nên mỗi video chỉ cần tính lại sau khoảng
 * `VIDEO_RANKING_STALENESS_PCT % × (decay + tuổi)` — video mới ~30 phút, video nhiều tháng tuổi vài ngày — hoặc sớm hơn khi
 * có tương tác (counter kéo `rank_due_at` về gần). Công việc mỗi giờ tỉ lệ với video HOẠT ĐỘNG + video trẻ, không với cả
 * catalogue.
 *
 * Cột nullable không default nên thêm là thao tác metadata (không rewrite bảng); NULL = đến hạn ngay (video mới / chưa
 * từng tính). Index một phần theo thứ tự đến hạn thay `idx_videos_rank_due` (theo `rank_computed_at`, không còn dùng).
 * Tạo/xoá CONCURRENTLY, ngoài transaction (cùng cách `ShortVideoRankingIndexes`).
 */
export class VideoRankDue1758700000000 implements MigrationInterface {
  name = 'VideoRankDue1758700000000';
  // PostgreSQL cấm CREATE/DROP INDEX CONCURRENTLY trong transaction.
  transaction = false;

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE videos ADD COLUMN IF NOT EXISTS rank_due_at timestamptz NULL',
    );
    // Lần build CONCURRENTLY bị huỷ để lại index INVALID mà IF NOT EXISTS sẽ bỏ qua: dọn trước.
    const rows = (await queryRunner.query(
      `SELECT i.indisvalid AS valid
         FROM pg_class c
         JOIN pg_index i ON i.indexrelid = c.oid
        WHERE c.relname = 'idx_videos_rank_due_at' AND c.relkind = 'i'`,
    )) as Array<{ valid: boolean }>;
    if (rows[0]?.valid === false) {
      await queryRunner.query(
        'DROP INDEX CONCURRENTLY IF EXISTS idx_videos_rank_due_at',
      );
    }
    await queryRunner.query(
      "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_videos_rank_due_at ON videos (rank_due_at ASC NULLS FIRST, id ASC) WHERE status = 'published'",
    );
    await queryRunner.query(
      'DROP INDEX CONCURRENTLY IF EXISTS idx_videos_rank_due',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Không CONCURRENTLY: `migration:revert` của TypeORM luôn mở transaction (CONCURRENTLY bị cấm trong đó).
    await queryRunner.query(
      "CREATE INDEX IF NOT EXISTS idx_videos_rank_due ON videos (rank_computed_at ASC NULLS FIRST, id ASC) WHERE status = 'published'",
    );
    await queryRunner.query('DROP INDEX IF EXISTS idx_videos_rank_due_at');
    await queryRunner.query(
      'ALTER TABLE videos DROP COLUMN IF EXISTS rank_due_at',
    );
  }
}
