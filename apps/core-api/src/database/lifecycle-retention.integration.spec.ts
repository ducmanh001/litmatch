import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { metrics } from '@opentelemetry/api';
import { DataSource } from 'typeorm';
import type { QueryRunner } from 'typeorm';

import { SnakeNamingStrategy } from './snake-naming.strategy';
import { RefreshToken } from '../modules/auth/entities/refresh-token.entity';
import { AuthRetentionJob } from '../modules/auth/jobs/auth-retention.job';
import { TypeOrmRefreshSessionAdapter } from '../modules/auth/repositories/typeorm-refresh-session.adapter';
import { StorySweeperService } from '../modules/feed/jobs/story-sweeper.service';
import { MatchingRetentionJob } from '../modules/matching/jobs/matching-retention.job';
import { EconomyRetentionJob } from '../modules/economy/jobs/economy-retention.job';
import { ShortVideoRetentionJob } from '../modules/short-video/jobs/short-video-retention.job';
import { MoodRetentionJob } from '../modules/mood/jobs/mood-retention.job';

import type { SchedulerRegistry } from '@nestjs/schedule';
import type { ConfigService } from '@nestjs/config';
import type { CoreApiEnv } from '../config/env.validation';

/**
 * Integration test vòng đời dữ liệu (ADR 0014) trên Postgres thật VỚI TOÀN BỘ migration (schema và index thật): mỗi quy tắc
 * retention xoá đúng hàng quá hạn và giữ nguyên hàng còn hạn, dry-run không xoá, token đã xoay bị dọn ngay lúc xoay theo họ,
 * và story sweeper xoá hết backlog (cascade `story_views`) trong MỘT tick. DB riêng `<tên gốc>_lifecycle`.
 */
const INTEGRATION_DB_URL = process.env['INTEGRATION_DB_URL'];
const d = INTEGRATION_DB_URL ? describe : describe.skip;
if (!INTEGRATION_DB_URL) {
  console.warn(
    '[lifecycle-retention.integration] BỎ QUA — set INTEGRATION_DB_URL để chạy trên Postgres thật',
  );
}

jest.setTimeout(120_000);

const CONFIG: Record<string, unknown> = {};
const configStub = {
  getOrThrow: (key: string) => {
    if (!(key in CONFIG)) throw new Error(`missing config ${key}`);
    return CONFIG[key];
  },
} as unknown as ConfigService<CoreApiEnv, true>;
const schedulerStub = {
  addInterval: () => undefined,
  doesExist: () => false,
  deleteInterval: () => undefined,
} as unknown as SchedulerRegistry;

function resetConfig(over: Record<string, unknown> = {}): void {
  for (const key of Object.keys(CONFIG)) delete CONFIG[key];
  Object.assign(CONFIG, {
    RETENTION_MODE: 'delete',
    RETENTION_INTERVAL_MS: 60_000,
    RETENTION_BATCH_SIZE: 100,
    RETENTION_MAX_BATCHES_PER_TICK: 20,
    RETENTION_BATCH_PAUSE_MS: 0,
    AUTH_REFRESH_TTL_DAYS: 30,
    AUTH_REFRESH_RETENTION_GRACE_DAYS: 7,
    AUTH_OTP_RETENTION_DAYS: 1,
    MATCHING_QUOTA_RETENTION_DAYS: 2,
    OUTBOX_PUBLISHED_RETENTION_DAYS: 7,
    OUTBOX_DEAD_LETTER_RETENTION_DAYS: 30,
    VIDEO_VIEW_RETENTION_DAYS: 180,
    VIDEO_DELETED_COMMENT_RETENTION_DAYS: 30,
    MOOD_EVENT_RETENTION_DAYS: 7,
    STORY_SWEEPER_INTERVAL_MS: 3_600_000,
    ...over,
  });
}

/** Nạp MỌI migration trong thư mục (đúng thứ tự thời gian) để schema/index giống production. */
async function loadAllMigrations(): Promise<Array<new () => unknown>> {
  const dir = join(__dirname, 'migrations');
  const files = readdirSync(dir)
    .filter((file) => /^\d+-.+\.ts$/u.test(file) && !file.endsWith('.spec.ts'))
    .sort();
  const migrations: Array<new () => unknown> = [];
  for (const file of files) {
    const loaded = (await import(join(dir, file))) as Record<string, unknown>;
    for (const value of Object.values(loaded)) {
      if (
        typeof value === 'function' &&
        typeof (value.prototype as { up?: unknown } | undefined)?.up ===
          'function'
      ) {
        migrations.push(value as new () => unknown);
      }
    }
  }
  return migrations;
}

d('Vòng đời dữ liệu (Postgres thật, toàn bộ migration)', () => {
  let ds: DataSource;
  /** Phiên nạp fixture: bỏ kiểm tra FK để không phải dựng cả cây cha (video, preset...) cho từng bảng. */
  let fixture: QueryRunner;
  const meter = metrics.getMeter('lifecycle-retention-integration');

  const q = <T = Array<Record<string, unknown>>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<T> => fixture.query(sql, params) as Promise<T>;
  const ids = async (table: string): Promise<string[]> =>
    (
      (await q(`SELECT id FROM ${table} ORDER BY id`)) as Array<{ id: string }>
    ).map((row) => row.id);
  const count = async (table: string): Promise<number> =>
    Number(
      (
        (await q(`SELECT count(*)::int AS n FROM ${table}`)) as Array<{
          n: number;
        }>
      )[0]?.n,
    );

  beforeAll(async () => {
    const url = new URL(INTEGRATION_DB_URL as string);
    const dbName = `${url.pathname.slice(1)}_lifecycle`;
    url.pathname = `/${dbName}`;

    const adminUrl = new URL(INTEGRATION_DB_URL as string);
    adminUrl.pathname = '/postgres';
    const admin = new DataSource({
      type: 'postgres',
      url: adminUrl.toString(),
    });
    await admin.initialize();
    const exists = await admin.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [dbName],
    );
    if (exists.length === 0) await admin.query(`CREATE DATABASE "${dbName}"`);
    await admin.destroy();

    ds = new DataSource({
      type: 'postgres',
      url: url.toString(),
      entities: [RefreshToken],
      migrations: await loadAllMigrations(),
      // Như data-source production: migration index nóng tạo CONCURRENTLY nên phải ngoài transaction.
      migrationsTransactionMode: 'each',
      namingStrategy: new SnakeNamingStrategy(),
      synchronize: false,
      dropSchema: true,
    });
    await ds.initialize();
    await ds.runMigrations();
    fixture = ds.createQueryRunner();
    await fixture.connect();
    await fixture.query('SET session_replication_role = replica');
  });

  afterAll(async () => {
    await fixture?.release();
    await ds?.destroy();
  });

  beforeEach(async () => {
    resetConfig();
    await q(
      `TRUNCATE refresh_tokens, phone_otps, match_daily_quotas, guest_match_quotas, outbox_events,
         video_views, video_comments, mood_status_events, story_views, stories CASCADE`,
    );
  });

  describe('migration index', () => {
    it('đủ index vòng đời, hợp lệ (indisvalid), đúng loại', async () => {
      const rows = (await q(
        `SELECT c.relname AS name, am.amname AS method, i.indisvalid AS valid
           FROM pg_class c
           JOIN pg_index i ON i.indexrelid = c.oid
           JOIN pg_am am ON am.oid = c.relam
          WHERE c.relname LIKE ANY (ARRAY['idx_%_brin', 'idx_outbox_events_%_at', 'idx_video_comments_deleted_at'])`,
      )) as Array<{ name: string; method: string; valid: boolean }>;
      const byName = new Map(rows.map((row) => [row.name, row]));
      for (const name of [
        'idx_refresh_tokens_created_brin',
        'idx_phone_otps_created_brin',
        'idx_video_views_created_brin',
        'idx_mood_status_events_created_brin',
        'idx_match_daily_quotas_date_brin',
        'idx_guest_match_quotas_date_brin',
      ]) {
        expect(byName.get(name)).toMatchObject({ method: 'brin', valid: true });
      }
      for (const name of [
        'idx_outbox_events_published_at',
        'idx_outbox_events_dead_lettered_at',
        'idx_video_comments_deleted_at',
      ]) {
        expect(byName.get(name)).toMatchObject({
          method: 'btree',
          valid: true,
        });
      }
    });
  });

  describe('auth: refresh_tokens + phone_otps', () => {
    const insertToken = async (createdDaysAgo: number): Promise<string> =>
      (
        (await q(
          `INSERT INTO refresh_tokens (user_id, token_hash, family_id, expires_at, created_at)
           VALUES (gen_random_uuid(), md5(random()::text) || md5(random()::text), gen_random_uuid(),
                   now() + interval '5 days', now() - make_interval(days => $1::int))
           RETURNING id`,
          [createdDaysAgo],
        )) as Array<{ id: string }>
      )[0].id;

    it('xoá token tạo quá TTL(30)+grace(7)=37 ngày, giữ token còn trong hạn; dry-run không xoá', async () => {
      const old = await insertToken(40);
      const oldest = await insertToken(400);
      const edge = await insertToken(36);
      const recent = await insertToken(1);
      const job = new AuthRetentionJob(ds, configStub, schedulerStub, meter);

      resetConfig({ RETENTION_MODE: 'dry-run' });
      const dry = await job.runOnce();
      expect(
        dry.find((r) => r.label === 'refresh_tokens:expired'),
      ).toMatchObject({ mode: 'dry-run', rows: 2 });
      expect(await count('refresh_tokens')).toBe(4);

      resetConfig();
      const results = await job.runOnce();
      expect(
        results.find((r) => r.label === 'refresh_tokens:expired'),
      ).toMatchObject({ mode: 'delete', rows: 2 });
      const left = await ids('refresh_tokens');
      expect(left.sort()).toEqual([edge, recent].sort());
      expect(left).not.toContain(old);
      expect(left).not.toContain(oldest);
    });

    it('xoá OTP quá 1 ngày, giữ OTP mới', async () => {
      await q(
        `INSERT INTO phone_otps (phone, code_hash, expires_at, created_at) VALUES
           ('+84900000001', repeat('a', 64), now() - interval '2 days', now() - interval '2 days'),
           ('+84900000002', repeat('b', 64), now() + interval '4 minutes', now() - interval '1 minute')`,
      );
      await new AuthRetentionJob(
        ds,
        configStub,
        schedulerStub,
        meter,
      ).runOnce();
      const rows = (await q(`SELECT phone FROM phone_otps`)) as Array<{
        phone: string;
      }>;
      expect(rows).toEqual([{ phone: '+84900000002' }]);
    });

    it('số ngày = 0 giữ vĩnh viễn: không có quy tắc nào được chạy', async () => {
      await insertToken(400);
      resetConfig({
        AUTH_REFRESH_RETENTION_GRACE_DAYS: 0,
        AUTH_OTP_RETENTION_DAYS: 0,
      });
      const results = await new AuthRetentionJob(
        ds,
        configStub,
        schedulerStub,
        meter,
      ).runOnce();
      expect(results).toEqual([]);
      expect(await count('refresh_tokens')).toBe(1);
    });

    describe('dọn token đã xoay NGAY LÚC xoay (theo họ)', () => {
      const adapter = () => new TypeOrmRefreshSessionAdapter(ds);
      /** Xoay chèn token thay thế bằng kết nối thường (có kiểm tra FK) nên cần user thật. */
      const createUser = async (): Promise<string> =>
        (
          (await q(
            `INSERT INTO users (nickname, avatar_id) VALUES ('rot-' || md5(random()::text), 'default-01') RETURNING id`,
          )) as Array<{ id: string }>
        )[0].id;
      let userId: string;
      beforeEach(async () => {
        userId = await createUser();
      });
      const insertFamilyToken = async (input: {
        familyId: string;
        rotatedDaysAgo: number | null;
      }): Promise<string> =>
        (
          (await q(
            `INSERT INTO refresh_tokens (user_id, token_hash, family_id, expires_at, rotated_at)
             VALUES ($3, md5(random()::text) || md5(random()::text), $1,
                     now() + interval '20 days',
                     CASE WHEN $2::int IS NULL THEN NULL ELSE now() - make_interval(days => $2::int) END)
             RETURNING id`,
            [input.familyId, input.rotatedDaysAgo, userId],
          )) as Array<{ id: string }>
        )[0].id;

      it('xoay xoá token đã xoay cũ hơn N ngày của CÙNG họ, giữ token xoay gần đây và họ khác', async () => {
        const familyId = '11111111-1111-4111-8111-111111111111';
        const otherFamily = '22222222-2222-4222-8222-222222222222';
        const stale = await insertFamilyToken({ familyId, rotatedDaysAgo: 10 });
        const recentlyRotated = await insertFamilyToken({
          familyId,
          rotatedDaysAgo: 3,
        });
        const current = await insertFamilyToken({
          familyId,
          rotatedDaysAgo: null,
        });
        const otherStale = await insertFamilyToken({
          familyId: otherFamily,
          rotatedDaysAgo: 10,
        });

        const result = await adapter().rotate({
          tokenId: current,
          replacement: {
            tokenHash: 'c'.repeat(64),
            expiresAt: new Date(Date.now() + 30 * 86_400_000),
          },
          purgeRotatedOlderThanDays: 7,
        });

        expect(result).toBe('rotated');
        const left = await ids('refresh_tokens');
        expect(left).not.toContain(stale);
        expect(left).toContain(recentlyRotated);
        expect(left).toContain(current); // vừa được đánh dấu đã xoay (3 ngày nữa mới đủ tuổi dọn)
        expect(left).toContain(otherStale); // họ khác không bị đụng
        expect(await count('refresh_tokens')).toBe(4); // 3 cũ còn lại + 1 token thay thế
      });

      it('không truyền hạn (dry-run/off) thì không xoá gì khi xoay', async () => {
        const familyId = '33333333-3333-4333-8333-333333333333';
        const stale = await insertFamilyToken({ familyId, rotatedDaysAgo: 10 });
        const current = await insertFamilyToken({
          familyId,
          rotatedDaysAgo: null,
        });

        await adapter().rotate({
          tokenId: current,
          replacement: {
            tokenHash: 'd'.repeat(64),
            expiresAt: new Date(Date.now() + 30 * 86_400_000),
          },
        });

        expect(await ids('refresh_tokens')).toContain(stale);
      });
    });
  });

  describe('matching: quota theo ngày', () => {
    it('xoá hàng của ngày cũ hơn 2 ngày ở cả bảng user và khách (khoá chính ghép → chọn lô theo ctid)', async () => {
      await q(
        `INSERT INTO match_daily_quotas (user_id, quota_date, match_type, count) VALUES
           (gen_random_uuid(), current_date - 5, 'voice', 3),
           (gen_random_uuid(), current_date - 3, 'soul', 3),
           (gen_random_uuid(), current_date - 1, 'voice', 3),
           (gen_random_uuid(), current_date, 'voice', 1)`,
      );
      await q(
        `INSERT INTO guest_match_quotas (quota_date, key_hash, count) VALUES
           (current_date - 4, repeat('a', 64), 1),
           (current_date, repeat('b', 64), 1)`,
      );

      const results = await new MatchingRetentionJob(
        ds,
        configStub,
        schedulerStub,
        meter,
      ).runOnce();

      expect(results.map((r) => [r.label, r.rows]).sort()).toEqual([
        ['guest_match_quotas:old', 1],
        ['match_daily_quotas:old', 2],
      ]);
      const quotaDates = (await q(
        `SELECT (current_date - quota_date)::int AS age FROM match_daily_quotas ORDER BY 1`,
      )) as Array<{ age: number }>;
      expect(quotaDates.map((row) => row.age)).toEqual([0, 1]);
      expect(await count('guest_match_quotas')).toBe(1);
    });
  });

  describe('economy: outbox_events (KHÔNG đụng sổ cái)', () => {
    it('xoá sự kiện đã publish quá 7 ngày và dead-letter quá 30 ngày; giữ sự kiện chưa publish dù cũ', async () => {
      await q(
        `INSERT INTO outbox_events (topic, event_type, payload, created_at, published_at, dead_lettered_at) VALUES
           ('t', 'e', '{}', now() - interval '20 days', now() - interval '10 days', NULL),
           ('t', 'e', '{}', now() - interval '3 days', now() - interval '2 days', NULL),
           ('t', 'e', '{}', now() - interval '90 days', NULL, NULL),
           ('t', 'e', '{}', now() - interval '60 days', NULL, now() - interval '40 days'),
           ('t', 'e', '{}', now() - interval '20 days', NULL, now() - interval '5 days')`,
      );

      const results = await new EconomyRetentionJob(
        ds,
        configStub,
        schedulerStub,
        meter,
      ).runOnce();

      expect(results.map((r) => [r.label, r.rows]).sort()).toEqual([
        ['outbox_events:dead_letter', 1],
        ['outbox_events:published', 1],
      ]);
      // còn: published 2 ngày trước, chưa publish (90 ngày), dead-letter 5 ngày trước
      expect(await count('outbox_events')).toBe(3);
      expect(
        Number(
          (
            (await q(
              `SELECT count(*)::int AS n FROM outbox_events WHERE published_at IS NULL AND dead_lettered_at IS NULL`,
            )) as Array<{ n: number }>
          )[0]?.n,
        ),
      ).toBe(1);
    });

    it('không có job nào của economy chạm transactions/ledger_entries (sổ cái append-only)', async () => {
      const job = new EconomyRetentionJob(ds, configStub, schedulerStub, meter);
      const tables = (job as unknown as { steps(): Array<{ table: string }> })
        .steps()
        .map((step) => step.table);
      expect(new Set(tables)).toEqual(new Set(['outbox_events']));
    });
  });

  describe('short-video', () => {
    it('xoá lượt xem quá 180 ngày và bình luận xoá mềm quá 30 ngày; giữ bình luận còn hiệu lực dù cũ', async () => {
      await q(
        `INSERT INTO video_views (video_id, viewer_id, created_at) VALUES
           (gen_random_uuid(), gen_random_uuid(), now() - interval '200 days'),
           (gen_random_uuid(), gen_random_uuid(), now() - interval '10 days')`,
      );
      await q(
        `INSERT INTO video_comments (video_id, author_user_id, content, deleted_at, created_at) VALUES
           (gen_random_uuid(), gen_random_uuid(), 'xoá mềm 40 ngày', now() - interval '40 days', now() - interval '60 days'),
           (gen_random_uuid(), gen_random_uuid(), 'xoá mềm 10 ngày', now() - interval '10 days', now() - interval '60 days'),
           (gen_random_uuid(), gen_random_uuid(), 'còn hiệu lực, cũ', NULL, now() - interval '400 days')`,
      );

      const results = await new ShortVideoRetentionJob(
        ds,
        configStub,
        schedulerStub,
        meter,
      ).runOnce();

      expect(results.map((r) => [r.label, r.rows]).sort()).toEqual([
        ['video_comments:deleted', 1],
        ['video_views:old', 1],
      ]);
      const comments = (await q(
        `SELECT content FROM video_comments ORDER BY content`,
      )) as Array<{ content: string }>;
      expect(comments.map((row) => row.content)).toEqual([
        'còn hiệu lực, cũ',
        'xoá mềm 10 ngày',
      ]);
      expect(await count('video_views')).toBe(1);
    });
  });

  describe('mood', () => {
    it('xoá sự kiện tâm trạng quá 7 ngày', async () => {
      await q(
        `INSERT INTO mood_status_events (user_id, kind, idempotency_key, created_at) VALUES
           (gen_random_uuid(), 'clear', 'k-old', now() - interval '9 days'),
           (gen_random_uuid(), 'clear', 'k-new', now() - interval '1 day')`,
      );
      await new MoodRetentionJob(
        ds,
        configStub,
        schedulerStub,
        meter,
      ).runOnce();
      const rows = (await q(
        `SELECT idempotency_key FROM mood_status_events`,
      )) as Array<{ idempotency_key: string }>;
      expect(rows).toEqual([{ idempotency_key: 'k-new' }]);
    });
  });

  describe('feed: story sweeper xoá hết backlog trong MỘT tick', () => {
    it('xoá 1.300 story hết hạn (3 lô) cùng story_views cascade; story còn hạn được giữ', async () => {
      await q(
        `INSERT INTO stories (author_user_id, media_url, expires_at, idempotency_key)
         SELECT gen_random_uuid(), 'm', now() - interval '1 hour', 'old-' || g
           FROM generate_series(1, 1300) g`,
      );
      const [alive] = (await q(
        `INSERT INTO stories (author_user_id, media_url, expires_at, idempotency_key)
         VALUES (gen_random_uuid(), 'm', now() + interval '1 hour', 'alive') RETURNING id`,
      )) as Array<{ id: string }>;
      await q(
        `INSERT INTO story_views (story_id, viewer_id)
         SELECT id, gen_random_uuid() FROM stories`,
      );

      const swept = await new StorySweeperService(
        ds,
        configStub,
        schedulerStub,
      ).runOnce();

      expect(swept).toBe(1300);
      expect(await ids('stories')).toEqual([alive.id]);
      expect(await count('story_views')).toBe(1);
    });
  });
});
