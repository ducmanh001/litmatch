import { MigrationInterface, QueryRunner } from 'typeorm';

const INDEXES = [
  {
    name: 'idx_transactions_created_at_brin',
    // Đối soát tăng dần chỉ đọc transaction trong cửa sổ `created_at` gần đây. `transactions` chỉ được thêm vào cuối
    // theo thời gian nên BRIN đủ chọn lọc, và gần như không tốn gì ở đường ghi nóng (khác B-tree phải cập nhật mỗi
    // lần ghi sổ).
    sql: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_created_at_brin ON transactions USING brin (created_at)',
  },
  {
    name: 'idx_iap_receipts_orphan',
    // Câu COUNT orphan receipt của tier fast chỉ cần các receipt đã credit mà chưa gắn transaction — thường là rỗng.
    sql: "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_iap_receipts_orphan ON iap_receipts (id) WHERE status = 'credited' AND transaction_id IS NULL",
  },
] as const;

/**
 * Chỉ mục cho đối soát ledger tăng dần (plan 2026-10-17 § 7a, ADR 0013). KHÔNG đụng dữ liệu hay ràng buộc của sổ cái:
 * chỉ thêm index (BRIN trên `transactions.created_at`, partial index cho orphan receipt). Tạo CONCURRENTLY, ngoài
 * transaction (cùng cách `ShortVideoRankingIndexes`).
 */
export class ReconciliationIndexes1758400000000 implements MigrationInterface {
  name = 'ReconciliationIndexes1758400000000';
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
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Không CONCURRENTLY: `migration:revert` của TypeORM luôn mở transaction (CONCURRENTLY bị cấm trong đó).
    for (const index of [...INDEXES].reverse()) {
      await queryRunner.query(`DROP INDEX IF EXISTS ${index.name}`);
    }
  }
}
