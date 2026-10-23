import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Thay sáu BRIN của `LifecycleIndexes1758500000000` bằng năm B-tree (ADR 0014; `guest_match_quotas` dùng khoá chính nên không cần index mới) — BRIN chỉ chọn lọc khi vị trí vật lý tương quan với thời
 * gian, và điều đó MẤT khi bảng bị chính retention xoá từ đầu rồi chèn lại: VACUUM trả trang cũ cho free-space map, hàng mới lấp
 * vào đó, còn summary của BRIN chỉ nở ra (không bao giờ co lại) nên mọi khoảng trang được tái sử dụng đều khớp `created_at <
 * cutoff`. ĐO (3 triệu hàng `refresh_tokens`, sau 4 vòng xoá 20% rồi chèn lại, kích thước bảng không đổi): chọn lô 5.000 hàng
 * bằng BRIN ≈ 430–540 ms và đọc ≈ 51.000 buffer (Seq Scan), B-tree ≈ 0,6 ms / 124 buffer (3,3 ms khi kèm FOR UPDATE SKIP LOCKED),
 * chỉ thêm ≈ 21 byte index mỗi hàng. Các cột này không bao giờ bị UPDATE (`created_at`, `expires_at`, `quota_date`) nên B-tree không
 * làm mất khả năng HOT của các UPDATE hiện có (đổi `rotated_at`, `watch_time_ms`, `count`...). `refresh_tokens` giờ khoá theo
 * `expires_at` (không phải `created_at`) để đổi `AUTH_REFRESH_TTL_DAYS` không làm xoá nhầm token còn hạn.
 *
 * Tạo/xoá CONCURRENTLY, ngoài transaction (cùng cách các migration index khác).
 */
const CREATE = [
  {
    name: 'idx_refresh_tokens_expires_at',
    sql: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens (expires_at)',
  },
  {
    name: 'idx_phone_otps_created_at',
    sql: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_phone_otps_created_at ON phone_otps (created_at)',
  },
  {
    name: 'idx_video_views_created_at',
    sql: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_video_views_created_at ON video_views (created_at)',
  },
  {
    name: 'idx_mood_status_events_created_at',
    sql: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mood_status_events_created_at ON mood_status_events (created_at)',
  },
  {
    name: 'idx_match_daily_quotas_quota_date',
    sql: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_match_daily_quotas_quota_date ON match_daily_quotas (quota_date)',
  },
  // `guest_match_quotas` KHÔNG cần index thay thế: khoá chính `(quota_date, key_hash)` đã dẫn đầu bằng `quota_date` nên phục vụ
  // `WHERE quota_date < … ORDER BY quota_date`; thêm `(quota_date)` chỉ là index trùng tiền tố (tốn ghi và dung lượng vô ích).
] as const;

const BRIN = [
  {
    name: 'idx_refresh_tokens_created_brin',
    restore:
      'CREATE INDEX IF NOT EXISTS idx_refresh_tokens_created_brin ON refresh_tokens USING brin (created_at)',
  },
  {
    name: 'idx_phone_otps_created_brin',
    restore:
      'CREATE INDEX IF NOT EXISTS idx_phone_otps_created_brin ON phone_otps USING brin (created_at)',
  },
  {
    name: 'idx_video_views_created_brin',
    restore:
      'CREATE INDEX IF NOT EXISTS idx_video_views_created_brin ON video_views USING brin (created_at)',
  },
  {
    name: 'idx_mood_status_events_created_brin',
    restore:
      'CREATE INDEX IF NOT EXISTS idx_mood_status_events_created_brin ON mood_status_events USING brin (created_at)',
  },
  {
    name: 'idx_match_daily_quotas_date_brin',
    restore:
      'CREATE INDEX IF NOT EXISTS idx_match_daily_quotas_date_brin ON match_daily_quotas USING brin (quota_date)',
  },
  {
    name: 'idx_guest_match_quotas_date_brin',
    restore:
      'CREATE INDEX IF NOT EXISTS idx_guest_match_quotas_date_brin ON guest_match_quotas USING brin (quota_date)',
  },
] as const;

export class LifecycleBtreeIndexes1758800000000 implements MigrationInterface {
  name = 'LifecycleBtreeIndexes1758800000000';
  // PostgreSQL cấm CREATE/DROP INDEX CONCURRENTLY trong transaction.
  transaction = false;

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const index of CREATE) {
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
    for (const index of BRIN) {
      await queryRunner.query(
        `DROP INDEX CONCURRENTLY IF EXISTS ${index.name}`,
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Không CONCURRENTLY: `migration:revert` của TypeORM luôn mở transaction (CONCURRENTLY bị cấm trong đó).
    for (const index of BRIN) {
      await queryRunner.query(index.restore);
    }
    for (const index of [...CREATE].reverse()) {
      await queryRunner.query(`DROP INDEX IF EXISTS ${index.name}`);
    }
  }
}
