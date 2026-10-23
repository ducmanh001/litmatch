import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Index cho các job retention vòng đời dữ liệu (ADR 0014). Chọn kiểu index theo chi phí GHI của bảng, vì các bảng này
 * nhận ghi rất nhanh (mô hình: refresh_tokens ≈ 3.900 hàng/giây trung bình ở 10 triệu CCU):
 * - BRIN trên cột thời gian chèn (`created_at`, `quota_date`): gần như không tốn gì lúc ghi; đủ chọn lọc vì hàng quá hạn
 *   nằm ở các block cũ và MỌI hàng đủ tuổi đều xoá được (không có "hàng sống sót" xen kẽ làm quét lặp lại).
 * - Index B-tree MỘT PHẦN cho bảng mà hàng chỉ đủ điều kiện sau một UPDATE (`published_at`, `deleted_at`): hàng chưa đủ điều
 *   kiện không có trong index nên không tốn gì lúc INSERT.
 * Tạo CONCURRENTLY, ngoài transaction (cùng cách `RetentionIndexes`). Kèm autovacuum riêng cho bảng xoá đều đặn.
 */
const INDEXES = [
  {
    name: 'idx_refresh_tokens_created_brin',
    sql: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_refresh_tokens_created_brin ON refresh_tokens USING brin (created_at)',
  },
  {
    name: 'idx_phone_otps_created_brin',
    sql: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_phone_otps_created_brin ON phone_otps USING brin (created_at)',
  },
  {
    name: 'idx_video_views_created_brin',
    sql: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_video_views_created_brin ON video_views USING brin (created_at)',
  },
  {
    name: 'idx_mood_status_events_created_brin',
    sql: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mood_status_events_created_brin ON mood_status_events USING brin (created_at)',
  },
  {
    name: 'idx_match_daily_quotas_date_brin',
    sql: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_match_daily_quotas_date_brin ON match_daily_quotas USING brin (quota_date)',
  },
  {
    name: 'idx_guest_match_quotas_date_brin',
    sql: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_guest_match_quotas_date_brin ON guest_match_quotas USING brin (quota_date)',
  },
  {
    name: 'idx_outbox_events_published_at',
    sql: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_outbox_events_published_at ON outbox_events (published_at) WHERE published_at IS NOT NULL',
  },
  {
    name: 'idx_outbox_events_dead_lettered_at',
    sql: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_outbox_events_dead_lettered_at ON outbox_events (dead_lettered_at) WHERE dead_lettered_at IS NOT NULL',
  },
  {
    name: 'idx_video_comments_deleted_at',
    sql: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_video_comments_deleted_at ON video_comments (deleted_at) WHERE deleted_at IS NOT NULL',
  },
] as const;

/** Bảng xoá đều đặn: vacuum sớm hơn mặc định (20% dead tuple) để không bloat. */
const AUTOVACUUM_TABLES = [
  'refresh_tokens',
  'phone_otps',
  'video_views',
  'outbox_events',
  'match_daily_quotas',
  'guest_match_quotas',
  'mood_status_events',
] as const;

export class LifecycleIndexes1758500000000 implements MigrationInterface {
  name = 'LifecycleIndexes1758500000000';
  // PostgreSQL cấm CREATE INDEX CONCURRENTLY trong transaction.
  transaction = false;

  async up(queryRunner: QueryRunner): Promise<void> {
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
    for (const table of AUTOVACUUM_TABLES) {
      await queryRunner.query(
        `ALTER TABLE ${table} SET (autovacuum_vacuum_scale_factor = 0.02, autovacuum_analyze_scale_factor = 0.02)`,
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of AUTOVACUUM_TABLES) {
      await queryRunner.query(
        `ALTER TABLE ${table} RESET (autovacuum_vacuum_scale_factor, autovacuum_analyze_scale_factor)`,
      );
    }
    // Không CONCURRENTLY: `migration:revert` của TypeORM luôn mở transaction (CONCURRENTLY bị cấm trong đó).
    for (const index of [...INDEXES].reverse()) {
      await queryRunner.query(`DROP INDEX IF EXISTS ${index.name}`);
    }
  }
}
