#!/usr/bin/env node
/**
 * Đo thông lượng xoá cascade của story sweeper bằng ĐÚNG câu SQL trong
 * `apps/core-api/src/modules/feed/jobs/story-sweeper.service.ts` (ADR 0014):
 *
 *   node scripts/capacity/bench/story-sweeper.mjs --template=litmatch_e2e --stories=12000 --viewsPerStory=100
 *
 * Nguồn của "một lô 500 story ≈ N ms" trong `scripts/capacity/data-growth.mjs` (`STORY_SWEEPER.labBatchMs`). Lượt xem được nạp xen kẽ
 * NGẪU NHIÊN giữa các story (không gom theo story) để không lợi thế quá mức cho cascade. Phiên xoá chạy với vai trò mặc định
 * để trigger FK `ON DELETE CASCADE` thật sự chạy.
 *
 * GIỚI HẠN: bảng vài trăm MB nằm gọn trong bộ nhớ → CẬN TRÊN; trên đĩa lạnh ở quy mô TB sẽ chậm hơn. Đo lại ở staging.
 */

import pg from 'pg';

import {
  assertLocalUrl,
  currentLsn,
  disableParallelWorkers,
  parseBenchArgs,
  skipForeignKeys,
  walBytesSince,
  withThrowawayDatabase,
} from './common.mjs';

const args = parseBenchArgs(process.argv.slice(2), {
  stories: 12_000,
  viewsPerStory: 100,
  batch: 500,
});

// Giống hệt story-sweeper.service.ts (một lô).
const SWEEP_SQL = `
  WITH removed AS (
    DELETE FROM stories
     WHERE id IN (
       SELECT id
         FROM stories
        WHERE expires_at <= now()
        ORDER BY expires_at ASC, id ASC
        LIMIT $1
     )
    RETURNING 1
  )
  SELECT count(*)::int AS n FROM removed`;

await withThrowawayDatabase(
  { url: args.url, template: args.template, name: 'lm_bench_story_sweeper' },
  async (loader) => {
    await skipForeignKeys(loader);
    await disableParallelWorkers(loader);
    const loadStart = Date.now();
    await loader.query(
      `INSERT INTO stories (id, author_user_id, media_url, audience, expires_at, idempotency_key, created_at)
       SELECT md5('s' || g::text)::uuid, md5('u' || (g % 50000)::text)::uuid, 'https://cdn.example/' || md5(g::text) || '.jpg',
              'friends', now() - interval '2 hours' + (g * interval '1 millisecond'), 'bench-story-' || g::text,
              now() - interval '26 hours'
         FROM generate_series(1, $1::int) g`,
      [args.stories],
    );
    await loader.query(
      `INSERT INTO story_views (story_id, viewer_id, created_at)
       SELECT md5('s' || s::text)::uuid, md5('v' || s::text || '-' || v::text)::uuid, now() - interval '25 hours'
         FROM generate_series(1, $1::int) s, generate_series(1, $2::int) v
        ORDER BY random()`,
      [args.stories, args.viewsPerStory],
    );
    await loader.query('VACUUM (ANALYZE) stories');
    await loader.query('VACUUM (ANALYZE) story_views');
    const size = (
      await loader.query(
        `SELECT pg_size_pretty(pg_total_relation_size('story_views')) AS views,
                pg_size_pretty(pg_total_relation_size('stories')) AS stories`,
      )
    ).rows[0];
    console.log(
      `nạp ${args.stories} story + ${args.stories * args.viewsPerStory} lượt xem trong ${((Date.now() - loadStart) / 1000).toFixed(1)} s; kích thước`,
      size,
    );

    // Phiên xoá riêng, vai trò mặc định (origin) để FK cascade chạy.
    const target = new URL(args.url);
    assertLocalUrl(args.url);
    target.pathname = '/lm_bench_story_sweeper';
    const deleter = new pg.Client({ connectionString: target.toString() });
    await deleter.connect();
    try {
      const wal0 = await currentLsn(deleter);
      const total = Date.now();
      const batchMs = [];
      let stories = 0;
      for (;;) {
        const start = process.hrtime.bigint();
        const { rows } = await deleter.query(SWEEP_SQL, [args.batch]);
        const ms = Number(process.hrtime.bigint() - start) / 1e6;
        if (rows[0].n === 0) break;
        stories += rows[0].n;
        batchMs.push(ms);
        if (rows[0].n < args.batch) break;
      }
      const seconds = (Date.now() - total) / 1000;
      const wal = await walBytesSince(deleter, wal0);
      batchMs.sort((a, b) => a - b);
      const percentile = (p) =>
        batchMs[
          Math.min(batchMs.length - 1, Math.floor((p / 100) * batchMs.length))
        ];
      const views = stories * args.viewsPerStory;
      console.log(
        JSON.stringify(
          {
            stories,
            viewsCascaded: views,
            batches: batchMs.length,
            seconds: Number(seconds.toFixed(2)),
            viewsPerSec: Math.round(views / seconds),
            batchMsP50: Number(percentile(50).toFixed(1)),
            batchMsP95: Number(percentile(95).toFixed(1)),
            batchMsMax: Number(batchMs[batchMs.length - 1].toFixed(1)),
            walBytesPerView: Math.round(wal / Math.max(1, views)),
          },
          null,
          2,
        ),
      );
    } finally {
      await deleter.end();
    }
  },
);
