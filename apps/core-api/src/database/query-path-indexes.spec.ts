import { QueryPathIndexes1756200000000 } from './migrations/1756200000000-query-path-indexes';

import type { QueryRunner } from 'typeorm';

function queryRunnerStub() {
  return {
    query: jest.fn().mockResolvedValue([]),
  } as unknown as QueryRunner;
}

describe('QueryPathIndexes1756200000000', () => {
  it('tạo đủ covering index cho ba query path nóng', async () => {
    const runner = queryRunnerStub();
    const migration = new QueryPathIndexes1756200000000();

    expect(migration.transaction).toBe(false);
    await migration.up(runner);

    expect(runner.query).toHaveBeenCalledTimes(6);
    expect(runner.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining(
        'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_call_sessions_active_updated',
      ),
    );
    expect(runner.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("WHERE status = 'active'"),
    );
    expect(runner.query).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining('blocked_user_id, blocker_user_id'),
    );
    expect(runner.query).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining('INCLUDE (action)'),
    );
    expect(runner.query).toHaveBeenNthCalledWith(
      6,
      expect.stringContaining('conversation_id, created_at'),
    );
    expect(runner.query).toHaveBeenNthCalledWith(
      6,
      expect.stringContaining('INCLUDE (sender_user_id)'),
    );
  });

  it('dọn index concurrent invalid hoặc sai shape trước khi retry build', async () => {
    const runner = queryRunnerStub();
    const query = runner.query as jest.Mock;
    query
      .mockResolvedValueOnce([
        {
          tableName: 'call_sessions',
          methodName: 'btree',
          isUnique: false,
          isValid: false,
          predicate: "(status = 'active'::call_session_status_enum)",
          keyColumns: ['updated_at', 'id'],
          keyDescending: [false, false],
          includedColumns: [],
        },
      ])
      .mockResolvedValueOnce(undefined);

    await new QueryPathIndexes1756200000000().up(runner);

    expect(query).toHaveBeenNthCalledWith(
      2,
      'DROP INDEX CONCURRENTLY IF EXISTS "idx_call_sessions_active_updated"',
    );
    expect(query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining(
        'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_call_sessions_active_updated',
      ),
    );
  });

  it('gỡ index theo thứ tự ngược khi rollback', async () => {
    const runner = queryRunnerStub();

    await new QueryPathIndexes1756200000000().down(runner);

    expect(runner.query).toHaveBeenNthCalledWith(
      1,
      'DROP INDEX CONCURRENTLY IF EXISTS idx_messages_conversation_created',
    );
    expect(runner.query).toHaveBeenNthCalledWith(
      2,
      'DROP INDEX CONCURRENTLY IF EXISTS idx_blocks_blocked_blocker_created',
    );
    expect(runner.query).toHaveBeenNthCalledWith(
      3,
      'DROP INDEX CONCURRENTLY IF EXISTS idx_call_sessions_active_updated',
    );
  });
});
