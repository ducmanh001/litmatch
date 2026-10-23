#!/usr/bin/env node
/**
 * Kiểm chứng (ADR 0014, migration 1758800000000): BRIN trên `created_at` còn chọn lọc không khi bảng bị chính retention xoá từ
 * đầu rồi chèn lại (trang được VACUUM trả cho free-space map rồi hàng mới lấp vào)? So với B-tree cùng cột.
 *
 *   node scripts/capacity/bench/brin-churn.mjs --template=litmatch_e2e --rows=3000000 --cycles=4
 *
 * Mỗi vòng: xoá 20% hàng cũ nhất, VACUUM, chèn lại số hàng đó (kích thước bảng không đổi). Rồi đo chọn lô 5.000 hàng đủ tuổi bằng
 * BRIN (có sẵn từ đầu, được duy trì qua mọi vòng) và bằng B-tree (dựng sau cùng — chọn lọc của B-tree không phụ thuộc lịch sử).
 * Cơ chế (summary BRIN chỉ nở ra, không bao giờ co lại) là tính chất của Postgres nên kết luận vững hơn từng con số ms.
 */

import {
  disableParallelWorkers,
  explainAnalyze,
  parseBenchArgs,
  skipForeignKeys,
  withThrowawayDatabase,
} from './common.mjs';

const args = parseBenchArgs(process.argv.slice(2), {
  rows: 3_000_000,
  cycles: 4,
  batch: 5_000,
});
const churn = Math.floor(args.rows * 0.2);

// "Thời gian" ảo: hàng thứ g có created_at = T0 + g giây; "bây giờ" = T0 + (tổng đã chèn) giây.
const T0 = "timestamptz '2026-01-01 00:00:00+00'";

await withThrowawayDatabase(
  { url: args.url, template: args.template, name: 'lm_bench_brin_churn' },
  async (client) => {
    await skipForeignKeys(client);
    await disableParallelWorkers(client);
    // Cô lập thí nghiệm: bỏ B-tree `expires_at` của migration 1758800000000, dựng lại BRIN cũ ngay từ bảng rỗng.
    await client.query('DROP INDEX IF EXISTS idx_refresh_tokens_expires_at');
    await client.query(
      'CREATE INDEX lm_bench_brin_created ON refresh_tokens USING brin (created_at)',
    );

    const insertRange = (from, to) =>
      client.query(
        `INSERT INTO refresh_tokens (user_id, token_hash, family_id, expires_at, rotated_at, created_at)
         SELECT md5((g % 1000000)::text)::uuid, md5(g::text) || md5(g::text || 'x'), md5((g / 6)::text)::uuid,
                ${T0} + (g || ' seconds')::interval + interval '30 days',
                CASE WHEN g % 10 < 9 THEN ${T0} + (g || ' seconds')::interval ELSE NULL END,
                ${T0} + (g || ' seconds')::interval
           FROM generate_series($1::int, $2::int) g`,
        [from, to],
      );
    const heapSize = async () =>
      (
        await client.query(
          `SELECT pg_size_pretty(pg_relation_size('refresh_tokens')) AS heap`,
        )
      ).rows[0].heap;
    const report = (label, result) =>
      console.log(
        `  ${label}: ${result.executionMs} ms, ${result.buffers} buffer, ${result.plan}`,
      );

    console.log(`nạp ${args.rows} hàng ban đầu...`);
    await insertRange(1, args.rows);
    await client.query('VACUUM (ANALYZE) refresh_tokens');
    console.log('kích thước ban đầu:', await heapSize());

    let inserted = args.rows;
    let deletedUpTo = 0;
    for (let cycle = 1; cycle <= args.cycles; cycle += 1) {
      const cutoff = deletedUpTo + churn;
      await client.query(
        `DELETE FROM refresh_tokens WHERE created_at < ${T0} + ($1 || ' seconds')::interval`,
        [cutoff + 1],
      );
      deletedUpTo = cutoff;
      await client.query('VACUUM (ANALYZE) refresh_tokens');
      await insertRange(inserted + 1, inserted + churn);
      inserted += churn;
      await client.query('VACUUM (ANALYZE) refresh_tokens');
      console.log(
        `vòng ${cycle}: đã xoá tới g=${deletedUpTo}, đã chèn tới g=${inserted}; kích thước`,
        await heapSize(),
      );
    }

    // Lô kế tiếp: `churn` hàng cũ nhất còn lại (đã đủ tuổi). Sau nhiều vòng chúng nằm lẫn trong các trang đã được tái sử dụng.
    const cutoffTs = `${T0} + ((${deletedUpTo + churn}) || ' seconds')::interval`;
    console.log(`chọn lô ${args.batch} hàng đủ tuổi:`);
    await client.query('SET enable_seqscan = on');
    report(
      'mặc định (BRIN có sẵn)',
      await explainAnalyze(
        client,
        `SELECT id FROM refresh_tokens WHERE created_at < ${cutoffTs} LIMIT ${args.batch}`,
      ),
    );
    await client.query('SET enable_seqscan = off');
    report(
      'BRIN ép dùng (enable_seqscan = off)',
      await explainAnalyze(
        client,
        `SELECT id FROM refresh_tokens WHERE created_at < ${cutoffTs} LIMIT ${args.batch}`,
      ),
    );

    await client.query('SET enable_seqscan = on');
    await client.query(
      'CREATE INDEX lm_bench_btree_created ON refresh_tokens (created_at)',
    );
    await client.query('VACUUM (ANALYZE) refresh_tokens');
    report(
      'B-tree created_at, ORDER BY',
      await explainAnalyze(
        client,
        `SELECT id FROM refresh_tokens WHERE created_at < ${cutoffTs} ORDER BY created_at LIMIT ${args.batch}`,
      ),
    );
    report(
      'B-tree created_at, FOR UPDATE SKIP LOCKED',
      await explainAnalyze(
        client,
        `WITH d AS MATERIALIZED (
           SELECT id FROM refresh_tokens WHERE created_at < ${cutoffTs} ORDER BY created_at LIMIT ${args.batch} FOR UPDATE SKIP LOCKED
         ) SELECT count(*) FROM d`,
      ),
    );
    const indexes = await client.query(
      `SELECT indexrelid::regclass AS name, pg_size_pretty(pg_relation_size(indexrelid)) AS size
         FROM pg_index WHERE indrelid = 'refresh_tokens'::regclass ORDER BY 1`,
    );
    console.log(
      'kích thước index:',
      indexes.rows.map((row) => `${row.name}=${row.size}`).join(', '),
    );
  },
);
