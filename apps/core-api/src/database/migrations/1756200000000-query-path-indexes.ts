import { MigrationInterface, QueryRunner } from 'typeorm';

interface IndexShape {
  tableName: string;
  keyColumns: string[];
  keyDescending: boolean[];
  includedColumns: string[];
  predicate: string | null;
}

interface CatalogIndexShape extends IndexShape {
  methodName: string;
  isUnique: boolean;
  isValid: boolean;
}

/**
 * Cover các read path nóng đã có batch/cursor nhưng thiếu đúng thứ tự filter + sort:
 * - Calling ticker: active theo updated_at (index cũ status+created_at chỉ cover pending).
 * - Safety hidden set: chiều inbound blocked_user_id trên log append-only.
 * - Friend list unread count: message mới hơn last_read_at theo từng conversation.
 */
export class QueryPathIndexes1756200000000 implements MigrationInterface {
  name = 'QueryPathIndexes1756200000000';
  // Các bảng này nhận write liên tục. TypeORM target dùng `--transaction each` để migration
  // này được phép opt-out; PostgreSQL cấm CONCURRENTLY bên trong transaction.
  transaction = false;

  async up(queryRunner: QueryRunner): Promise<void> {
    await this.dropMismatchedIndex(queryRunner, {
      name: 'idx_call_sessions_active_updated',
      tableName: 'call_sessions',
      keyColumns: ['updated_at', 'id'],
      keyDescending: [false, false],
      includedColumns: [],
      predicate: "status = 'active'",
    });
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_call_sessions_active_updated
        ON call_sessions (updated_at, id)
        WHERE status = 'active'
    `);
    await this.dropMismatchedIndex(queryRunner, {
      name: 'idx_blocks_blocked_blocker_created',
      tableName: 'blocks',
      keyColumns: ['blocked_user_id', 'blocker_user_id', 'created_at'],
      keyDescending: [false, false, true],
      includedColumns: ['action'],
      predicate: null,
    });
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_blocks_blocked_blocker_created
        ON blocks (blocked_user_id, blocker_user_id, created_at DESC)
        INCLUDE (action)
    `);
    await this.dropMismatchedIndex(queryRunner, {
      name: 'idx_messages_conversation_created',
      tableName: 'messages',
      keyColumns: ['conversation_id', 'created_at'],
      keyDescending: [false, false],
      includedColumns: ['sender_user_id'],
      predicate: null,
    });
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_conversation_created
        ON messages (conversation_id, created_at)
        INCLUDE (sender_user_id)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX CONCURRENTLY IF EXISTS idx_messages_conversation_created',
    );
    await queryRunner.query(
      'DROP INDEX CONCURRENTLY IF EXISTS idx_blocks_blocked_blocker_created',
    );
    await queryRunner.query(
      'DROP INDEX CONCURRENTLY IF EXISTS idx_call_sessions_active_updated',
    );
  }

  /**
   * PostgreSQL có thể để lại index `indisvalid=false` nếu build concurrent bị ngắt.
   * `IF NOT EXISTS` cũng bỏ qua index cùng tên nhưng sai shape. Fail closed: chỉ giữ index
   * valid, B-tree, không unique và có đúng table/key/include/predicate mà read path yêu cầu.
   */
  private async dropMismatchedIndex(
    queryRunner: QueryRunner,
    expected: IndexShape & { name: string },
  ): Promise<void> {
    const rows: unknown = await queryRunner.query(
      `
        SELECT
          table_class.relname AS "tableName",
          access_method.amname AS "methodName",
          candidate.indisunique AS "isUnique",
          candidate.indisvalid AS "isValid",
          pg_catalog.pg_get_expr(
            candidate.indpred,
            candidate.indrelid
          ) AS predicate,
          COALESCE(
            ARRAY(
              SELECT attribute.attname
              FROM unnest(candidate.indkey::smallint[]) WITH ORDINALITY
                AS position(attribute_number, ordinal)
              INNER JOIN pg_catalog.pg_attribute AS attribute
                ON attribute.attrelid = candidate.indrelid
                AND attribute.attnum = position.attribute_number
              WHERE position.ordinal <= candidate.indnkeyatts
              ORDER BY position.ordinal
            ),
            ARRAY[]::name[]
          ) AS "keyColumns",
          COALESCE(
            ARRAY(
              SELECT (position.option & 1) = 1
              FROM unnest(candidate.indoption::smallint[]) WITH ORDINALITY
                AS position(option, ordinal)
              WHERE position.ordinal <= candidate.indnkeyatts
              ORDER BY position.ordinal
            ),
            ARRAY[]::boolean[]
          ) AS "keyDescending",
          COALESCE(
            ARRAY(
              SELECT attribute.attname
              FROM unnest(candidate.indkey::smallint[]) WITH ORDINALITY
                AS position(attribute_number, ordinal)
              INNER JOIN pg_catalog.pg_attribute AS attribute
                ON attribute.attrelid = candidate.indrelid
                AND attribute.attnum = position.attribute_number
              WHERE position.ordinal > candidate.indnkeyatts
              ORDER BY position.ordinal
            ),
            ARRAY[]::name[]
          ) AS "includedColumns"
        FROM pg_catalog.pg_index AS candidate
        INNER JOIN pg_catalog.pg_class AS index_class
          ON index_class.oid = candidate.indexrelid
        INNER JOIN pg_catalog.pg_class AS table_class
          ON table_class.oid = candidate.indrelid
        INNER JOIN pg_catalog.pg_namespace AS index_namespace
          ON index_namespace.oid = index_class.relnamespace
        INNER JOIN pg_catalog.pg_am AS access_method
          ON access_method.oid = index_class.relam
        WHERE index_class.relname = $1
          AND index_namespace.nspname = current_schema()
        LIMIT 1
      `,
      [expected.name],
    );

    if (!Array.isArray(rows) || rows.length === 0) return;
    const actual = rows[0] as CatalogIndexShape;
    const matches =
      actual.isValid &&
      !actual.isUnique &&
      actual.methodName === 'btree' &&
      actual.tableName === expected.tableName &&
      this.sameColumns(actual.keyColumns, expected.keyColumns) &&
      this.sameValues(actual.keyDescending, expected.keyDescending) &&
      this.sameColumns(actual.includedColumns, expected.includedColumns) &&
      this.normalizePredicate(actual.predicate) ===
        this.normalizePredicate(expected.predicate);

    if (!matches) {
      await queryRunner.query(
        `DROP INDEX CONCURRENTLY IF EXISTS "${expected.name}"`,
      );
    }
  }

  private sameColumns(actual: string[], expected: string[]): boolean {
    return this.sameValues(actual, expected);
  }

  private sameValues<T>(actual: T[], expected: T[]): boolean {
    return (
      Array.isArray(actual) &&
      actual.length === expected.length &&
      actual.every((value, index) => value === expected[index])
    );
  }

  private normalizePredicate(predicate: string | null): string | null {
    if (predicate === null) return null;
    return predicate
      .replace(/::(?:"[^"]+"|[a-zA-Z_][a-zA-Z0-9_.]*)(?:\[\])?/g, '')
      .replace(/[()]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
