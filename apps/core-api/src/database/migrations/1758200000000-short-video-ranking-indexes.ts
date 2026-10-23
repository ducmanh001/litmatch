import { MigrationInterface, QueryRunner } from 'typeorm';

const INDEXES = [
  {
    name: 'idx_videos_ranked',
    // Phục vụ `sort=ranked`: sắp theo (rank_score DESC, id DESC) có cursor keyset — không quét/sort mọi video published.
    sql: "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_videos_ranked ON videos (rank_score DESC, id DESC) WHERE status = 'published' AND rank_score IS NOT NULL",
  },
  {
    name: 'idx_videos_rank_due',
    // Phục vụ job ranking: video chưa từng tính điểm (NULL) trước, rồi video tính điểm lâu nhất.
    sql: "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_videos_rank_due ON videos (rank_computed_at ASC NULLS FIRST, id ASC) WHERE status = 'published'",
  },
] as const;

/**
 * Ranking short-video (plan 2026-10-17 § 7a):
 * - `idx_videos_ranked`: `sort=ranked` chạy theo index thay vì quét + sort toàn bộ video published.
 * - `rank_computed_at` + `idx_videos_rank_due`: job ranking xoay vòng theo "lần tính điểm gần nhất" thay vì theo
 *   `updated_at`. Trước đây `increment` counter tự cập nhật `updated_at` nên video đang nóng bị xếp CUỐI hàng
 *   chờ, và video mới (rank_score NULL) phải đợi cả vòng mới có điểm.
 * Cột nullable không default nên thêm là thao tác metadata (không rewrite bảng). Index tạo CONCURRENTLY, ngoài
 * transaction (cùng cách `QueryPathIndexes`/`RetentionIndexes`).
 */
export class ShortVideoRankingIndexes1758200000000 implements MigrationInterface {
  name = 'ShortVideoRankingIndexes1758200000000';
  // PostgreSQL cấm CREATE INDEX CONCURRENTLY trong transaction.
  transaction = false;

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE videos ADD COLUMN IF NOT EXISTS rank_computed_at timestamptz NULL',
    );
    for (const index of INDEXES) {
      // Lần build CONCURRENTLY bị huỷ để lại index INVALID mà IF NOT EXISTS sẽ bỏ qua: dọn trước.
      const rows = (await queryRunner.query(
        `SELECT i.indisvalid AS valid
           FROM pg_class c
           JOIN pg_index i ON i.indexrelid = c.oid
          WHERE c.relname = $1 AND c.relkind = 'i'`,
        [index.name],
      )) as Array<{ valid: boolean }>;
      if (rows[0]?.valid === false) {
        await queryRunner.query(
          `DROP INDEX CONCURRENTLY IF EXISTS ${index.name}`,
        );
      }
      await queryRunner.query(index.sql);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Không CONCURRENTLY: `migration:revert` của TypeORM luôn mở transaction (CONCURRENTLY bị cấm trong đó).
    for (const index of [...INDEXES].reverse()) {
      await queryRunner.query(`DROP INDEX IF EXISTS ${index.name}`);
    }
    await queryRunner.query(
      'ALTER TABLE videos DROP COLUMN IF EXISTS rank_computed_at',
    );
  }
}
