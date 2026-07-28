import { DataSource } from 'typeorm';

import { QueryPathIndexes1756200000000 } from './migrations/1756200000000-query-path-indexes';

const INTEGRATION_DB_URL = process.env['INTEGRATION_DB_URL'];
const d = INTEGRATION_DB_URL ? describe : describe.skip;
if (!INTEGRATION_DB_URL) {
  console.warn(
    '[query-path-indexes.integration] BỎ QUA — set INTEGRATION_DB_URL để kiểm tra index trên Postgres thật',
  );
}

jest.setTimeout(60_000);

d('Query-path indexes integration (Postgres thật)', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    const url = new URL(INTEGRATION_DB_URL as string);
    const databaseName = `${url.pathname.slice(1)}_query_indexes`;
    url.pathname = `/${databaseName}`;

    const adminUrl = new URL(INTEGRATION_DB_URL as string);
    adminUrl.pathname = '/postgres';
    const admin = new DataSource({
      type: 'postgres',
      url: adminUrl.toString(),
    });
    await admin.initialize();
    const existing = await admin.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [databaseName],
    );
    if (existing.length === 0) {
      await admin.query(`CREATE DATABASE "${databaseName}"`);
    }
    await admin.destroy();

    dataSource = new DataSource({
      type: 'postgres',
      url: url.toString(),
      migrations: [QueryPathIndexes1756200000000],
      migrationsTransactionMode: 'each',
      synchronize: false,
      dropSchema: true,
    });
    await dataSource.initialize();
    await dataSource.query(`
      CREATE TABLE call_sessions (
        id uuid PRIMARY KEY,
        status varchar(16) NOT NULL,
        updated_at timestamptz NOT NULL
      )
    `);
    await dataSource.query(`
      CREATE TABLE blocks (
        id uuid PRIMARY KEY,
        blocked_user_id uuid NOT NULL,
        blocker_user_id uuid NOT NULL,
        created_at timestamptz NOT NULL,
        action varchar(16) NOT NULL
      )
    `);
    await dataSource.query(`
      CREATE TABLE messages (
        id uuid PRIMARY KEY,
        conversation_id uuid NOT NULL,
        created_at timestamptz NOT NULL,
        sender_user_id uuid NOT NULL
      )
    `);

    // Mô phỏng deploy trước bị để lại index cùng tên nhưng sai shape.
    await dataSource.query(
      'CREATE INDEX idx_call_sessions_active_updated ON call_sessions (id)',
    );
    await dataSource.query(
      'CREATE INDEX idx_blocks_blocked_blocker_created ON blocks (id)',
    );
    await dataSource.query(
      'CREATE INDEX idx_messages_conversation_created ON messages (id)',
    );

    await dataSource.runMigrations({ transaction: 'each' });
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  it('thay index sai shape bằng ba covering index valid ngoài transaction', async () => {
    const rows = (await dataSource.query(`
      SELECT
        index_class.relname AS name,
        candidate.indisvalid AS valid,
        pg_catalog.pg_get_indexdef(candidate.indexrelid) AS definition
      FROM pg_catalog.pg_index AS candidate
      INNER JOIN pg_catalog.pg_class AS index_class
        ON index_class.oid = candidate.indexrelid
      WHERE index_class.relname IN (
        'idx_call_sessions_active_updated',
        'idx_blocks_blocked_blocker_created',
        'idx_messages_conversation_created'
      )
      ORDER BY index_class.relname
    `)) as Array<{ name: string; valid: boolean; definition: string }>;

    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.valid)).toBe(true);
    const callingDefinition = rows.find((row) =>
      row.name.includes('call_sessions'),
    )?.definition;
    expect(callingDefinition).toContain('USING btree (updated_at, id)');
    expect(callingDefinition).toContain('WHERE');
    expect(callingDefinition).toContain("'active'");
    expect(
      rows.find((row) => row.name.includes('blocks'))?.definition,
    ).toContain(
      'USING btree (blocked_user_id, blocker_user_id, created_at DESC) INCLUDE (action)',
    );
    expect(
      rows.find((row) => row.name.includes('messages'))?.definition,
    ).toContain(
      'USING btree (conversation_id, created_at) INCLUDE (sender_user_id)',
    );
  });
});
