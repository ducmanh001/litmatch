#!/usr/bin/env node
/**
 * Kiểm tra KẾ HOẠCH của câu xoá theo `ctid` + `tableoid` (quy tắc quota của `MatchingRetentionJob`, ADR 0014) trên bảng lớn:
 * phải là Nested Loop + Tid Scan có tham số trên một lô nhỏ, KHÔNG phải hash join/quét cả bảng đích.
 *
 *   node scripts/capacity/bench/ctid-delete-plan.mjs --template=litmatch_e2e --rows=2000000
 *
 * Câu SQL giữ đồng bộ với `buildDeleteSql` (apps/core-api/src/common/retention/batched-purge.ts). `EXPLAIN ANALYZE` chạy trong
 * transaction rồi ROLLBACK nên không xoá thật.
 */

import {
  disableParallelWorkers,
  parseBenchArgs,
  skipForeignKeys,
  withThrowawayDatabase,
} from './common.mjs';

const args = parseBenchArgs(process.argv.slice(2), {
  rows: 2_000_000,
  batch: 5_000,
  retentionDays: 2,
});

const deleteSql = (table) => `
  WITH doomed AS MATERIALIZED (
    SELECT ctid, tableoid FROM ${table}
     WHERE quota_date < current_date - $2::int
     ORDER BY quota_date
     LIMIT $1
     FOR UPDATE SKIP LOCKED
  ), removed AS (
    DELETE FROM ${table} t
     USING doomed d
     WHERE t.ctid = d.ctid AND t.tableoid = d.tableoid
    RETURNING 1
  )
  SELECT count(*)::int AS n FROM removed`;

await withThrowawayDatabase(
  { url: args.url, template: args.template, name: 'lm_bench_ctid_plan' },
  async (client) => {
    await skipForeignKeys(client);
    await disableParallelWorkers(client);
    await client.query(
      `INSERT INTO match_daily_quotas (user_id, quota_date, match_type, count)
       SELECT md5(g::text)::uuid, current_date - (g % 30)::int, CASE WHEN g % 2 = 0 THEN 'soul' ELSE 'voice' END, 1
         FROM generate_series(1, $1::int) g`,
      [args.rows],
    );
    await client.query(
      `INSERT INTO guest_match_quotas (quota_date, key_hash, count)
       SELECT current_date - (g % 30)::int, md5(g::text) || md5(g::text || 'k'), 1
         FROM generate_series(1, $1::int) g`,
      [Math.floor(args.rows / 2)],
    );
    await client.query('VACUUM (ANALYZE) match_daily_quotas');
    await client.query('VACUUM (ANALYZE) guest_match_quotas');
    for (const table of ['match_daily_quotas', 'guest_match_quotas']) {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `EXPLAIN (ANALYZE, BUFFERS, COSTS OFF, TIMING OFF) ${deleteSql(table)}`,
        [args.batch, args.retentionDays],
      );
      await client.query('ROLLBACK');
      const plan = rows.map((row) => row['QUERY PLAN']).join('\n');
      console.log(`=== ${table}\n${plan}`);
      for (const expected of ['Nested Loop', 'Tid Scan']) {
        if (!plan.includes(expected)) {
          throw new Error(`${table}: kế hoạch không có "${expected}"`);
        }
      }
      if (/Hash Join|Seq Scan on \w+ t\b/u.test(plan)) {
        throw new Error(`${table}: kế hoạch quét/hash cả bảng đích`);
      }
    }
  },
);
