#!/usr/bin/env node
/**
 * Đo thông lượng xoá theo lô của khung retention trên `refresh_tokens` bằng ĐÚNG câu SQL và quy tắc của
 * `AuthRetentionJob` (`expires_at < now() - GRACE`, `ORDER BY expires_at`, `FOR UPDATE SKIP LOCKED`) — ADR 0014.
 *
 *   node scripts/capacity/bench/retention-delete.mjs --template=litmatch_e2e --rows=3000000
 *
 * Nguồn của các con số "xoá ~N hàng/giây, M byte WAL/hàng, VACUUM T giây" trong ADR 0014. Giữ câu SQL đồng bộ với
 * `buildDeleteSql` (apps/core-api/src/common/retention/batched-purge.ts); tính đúng của chính câu đó được
 * `lifecycle-retention.integration.spec.ts` kiểm trên Postgres thật.
 *
 * GIỚI HẠN: một kết nối, container cục bộ, dữ liệu nằm trong cache, không có tải ghi đồng thời hay replica — KHÔNG phải
 * số của đĩa quy mô TB. Đo lại ở staging trước khi dựa vào.
 */

import {
  currentLsn,
  disableParallelWorkers,
  explainAnalyze,
  parseBenchArgs,
  skipForeignKeys,
  walBytesSince,
  withThrowawayDatabase,
} from './common.mjs';

const args = parseBenchArgs(process.argv.slice(2), {
  rows: 3_000_000,
  batch: 5_000,
  graceDays: 7,
  ttlDays: 30,
  spreadDays: 45,
});

// Giống buildDeleteSql của quy tắc `refresh_tokens:expired` (có orderBy).
const DELETE_SQL = `
  WITH doomed AS MATERIALIZED (
    SELECT id FROM refresh_tokens
     WHERE expires_at < now() - make_interval(days => $2)
     ORDER BY expires_at
     LIMIT $1
     FOR UPDATE SKIP LOCKED
  ), removed AS (
    DELETE FROM refresh_tokens t
     USING doomed d
     WHERE t.id = d.id
    RETURNING 1
  )
  SELECT count(*)::int AS n FROM removed`;

await withThrowawayDatabase(
  { url: args.url, template: args.template, name: 'lm_bench_retention' },
  async (client) => {
    await skipForeignKeys(client);
    await disableParallelWorkers(client);
    const sizes = async () =>
      (
        await client.query(
          `SELECT pg_size_pretty(pg_relation_size('refresh_tokens')) AS heap,
                  pg_size_pretty(pg_indexes_size('refresh_tokens')) AS indexes,
                  (SELECT n_dead_tup FROM pg_stat_user_tables WHERE relname = 'refresh_tokens') AS dead`,
        )
      ).rows[0];

    // created_at trải đều ${spreadDays} ngày, expires_at = created_at + TTL: phần đủ tuổi xoá = (spread − TTL − GRACE) / spread.
    const loadStart = Date.now();
    await client.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, family_id, expires_at, rotated_at, created_at)
       SELECT md5((g % 1000000)::text)::uuid, md5(g::text) || md5(g::text || 'x'), md5((g / 6)::text)::uuid,
              created + make_interval(days => $2::int),
              CASE WHEN g % 10 < 9 THEN created END,
              created
         FROM (SELECT g, now() - ((($1::int - g) * interval '1 second') * ($3::float8 * 86400 / $1::float8)) AS created
                 FROM generate_series(1, $1::int) g) s`,
      [args.rows, args.ttlDays, args.spreadDays],
    );
    await client.query('VACUUM (ANALYZE) refresh_tokens');
    console.log(
      `nạp ${args.rows} hàng: ${((Date.now() - loadStart) / 1000).toFixed(1)} s`,
      await sizes(),
    );

    const pick = await explainAnalyze(
      client,
      `SELECT id FROM refresh_tokens WHERE expires_at < now() - make_interval(days => $2) ORDER BY expires_at LIMIT $1`,
      [args.batch, args.graceDays],
    );
    console.log(
      `chọn một lô ${args.batch} hàng (bảng mới nạp): ${pick.executionMs} ms, ${pick.buffers} buffer, ${pick.plan}`,
    );

    const wal0 = await currentLsn(client);
    const deleteStart = Date.now();
    let removed = 0;
    let batches = 0;
    for (;;) {
      const { rows } = await client.query(DELETE_SQL, [
        args.batch,
        args.graceDays,
      ]);
      batches += 1;
      removed += rows[0].n;
      if (rows[0].n < args.batch) break;
    }
    const seconds = (Date.now() - deleteStart) / 1000;
    const wal = await walBytesSince(client, wal0);
    console.log(
      `xoá ${removed} hàng / ${batches} lô trong ${seconds.toFixed(1)} s = ${Math.round(removed / seconds)} hàng/giây; ` +
        `WAL ${(wal / 1_048_576).toFixed(0)} MiB (${Math.round(wal / Math.max(1, removed))} byte/hàng)`,
    );
    console.log('sau xoá (chưa vacuum):', await sizes());
    const vacuumStart = Date.now();
    await client.query('VACUUM (ANALYZE) refresh_tokens');
    console.log(
      `VACUUM: ${((Date.now() - vacuumStart) / 1000).toFixed(1)} s`,
      await sizes(),
    );
  },
);
