import { MigrationInterface, QueryRunner } from 'typeorm';

const INDEXES = [
  {
    name: 'idx_notifications_read_at',
    sql: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_read_at ON notifications (read_at) WHERE read_at IS NOT NULL',
  },
  {
    name: 'idx_notifications_unread_created',
    sql: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_unread_created ON notifications (created_at) WHERE read_at IS NULL',
  },
] as const;

/** Bảng có retention xoá theo lô: vacuum sớm hơn mặc định (20% dead tuple) để không bloat. */
const AUTOVACUUM_TABLES = ['notifications'] as const;

/**
 * Index cho job retention `notifications` (ADR 0013): mỗi lô chọn hàng cũ nhất theo thứ tự index nên không quét
 * cả bảng. Hai index một phần cho hai quy tắc (đã đọc theo `read_at`, chưa đọc theo `created_at`); index
 * chưa-đọc co lại khi notification được đọc nên rẻ. Cùng autovacuum riêng cho bảng (xoá đều đặn tạo dead tuple
 * nhanh hơn ngưỡng mặc định). Bảng nhận ghi liên tục nên tạo CONCURRENTLY, ngoài transaction (cùng cách
 * `QueryPathIndexes`).
 *
 * Không có retention `soul_chat_messages`: phòng của cặp đã là bạn không bao giờ đóng và entity quy định giữ
 * bằng chứng cho Report/T&S. Không partition: `messages.idempotency_key` UNIQUE toàn cục không còn đảm bảo nếu
 * bảng chia theo thời gian (ràng buộc unique phải chứa khoá partition) — xem ADR 0013.
 */
export class RetentionIndexes1758000000000 implements MigrationInterface {
  name = 'RetentionIndexes1758000000000';
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
