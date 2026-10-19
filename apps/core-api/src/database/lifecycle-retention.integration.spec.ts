import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { metrics } from '@opentelemetry/api';
import { DataSource } from 'typeorm';
import type { QueryRunner } from 'typeorm';

import { LifecycleBtreeIndexes1758800000000 } from './migrations/1758800000000-lifecycle-btree-indexes';
import { SnakeNamingStrategy } from './snake-naming.strategy';
import { RefreshToken } from '../modules/auth/entities/refresh-token.entity';
import { AuthRetentionJob } from '../modules/auth/jobs/auth-retention.job';
import { TypeOrmRefreshSessionAdapter } from '../modules/auth/repositories/typeorm-refresh-session.adapter';
import { StorySweeperService } from '../modules/feed/jobs/story-sweeper.service';
import {
  buildCountSql,
  buildDeleteSql,
} from '../common/retention/batched-purge';
import { MatchingRetentionJob } from '../modules/matching/jobs/matching-retention.job';
import { EconomyRetentionJob } from '../modules/economy/jobs/economy-retention.job';
import { ShortVideoRetentionJob } from '../modules/short-video/jobs/short-video-retention.job';
import { MoodRetentionJob } from '../modules/mood/jobs/mood-retention.job';

import type { SchedulerRegistry } from '@nestjs/schedule';
import type { PurgeStep } from '../common/retention/batched-purge';
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
    MOOD_STATUS_TTL_HOURS: 24,
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
    it('đủ index vòng đời, hợp lệ (indisvalid), đúng loại; BRIN cũ đã được thay bằng B-tree', async () => {
      const rows = (await q(
        `SELECT c.relname AS name, am.amname AS method, i.indisvalid AS valid
           FROM pg_class c
           JOIN pg_index i ON i.indexrelid = c.oid
           JOIN pg_am am ON am.oid = c.relam
          WHERE c.relname LIKE ANY (ARRAY['idx_%_brin', 'idx_%_expires_at', 'idx_%_created_at', 'idx_%_quota_date',
                                          'idx_outbox_events_%_at', 'idx_video_comments_deleted_at'])`,
      )) as Array<{ name: string; method: string; valid: boolean }>;
      const byName = new Map(rows.map((row) => [row.name, row]));
      for (const name of [
        'idx_refresh_tokens_expires_at',
        'idx_phone_otps_created_at',
        'idx_video_views_created_at',
        'idx_mood_status_events_created_at',
        'idx_match_daily_quotas_quota_date',
        'idx_outbox_events_published_at',
        'idx_outbox_events_dead_lettered_at',
        'idx_video_comments_deleted_at',
      ]) {
        expect(byName.get(name)).toMatchObject({
          method: 'btree',
          valid: true,
        });
      }
      // BRIN mất chọn lọc khi bảng bị xoá từ đầu rồi chèn lại (đo ở migration 1758800000000) nên sáu BRIN của các bảng
      // có retention đã bị gỡ. BRIN của `transactions` (sổ cái append-only, không bao giờ xoá) được GIỮ: đúng chỗ dùng BRIN.
      expect(
        [...byName.keys()].filter((name) => name.endsWith('_brin')),
      ).toEqual(['idx_transactions_created_at_brin']);
    });

    const BRIN_NAMES = [
      'idx_guest_match_quotas_date_brin',
      'idx_match_daily_quotas_date_brin',
      'idx_mood_status_events_created_brin',
      'idx_phone_otps_created_brin',
      'idx_refresh_tokens_created_brin',
      'idx_video_views_created_brin',
    ];
    const BTREE_NAMES = [
      'idx_match_daily_quotas_quota_date',
      'idx_mood_status_events_created_at',
      'idx_phone_otps_created_at',
      'idx_refresh_tokens_expires_at',
      'idx_video_views_created_at',
    ];
    const indexState = async (): Promise<{
      brin: string[];
      btree: string[];
    }> => {
      const rows = (await q(
        `SELECT c.relname AS name, i.indisvalid AS valid
           FROM pg_class c JOIN pg_index i ON i.indexrelid = c.oid
          WHERE c.relname = ANY ($1::text[])`,
        [[...BRIN_NAMES, ...BTREE_NAMES]],
      )) as Array<{ name: string; valid: boolean }>;
      const valid = rows.filter((row) => row.valid).map((row) => row.name);
      return {
        brin: valid.filter((name) => BRIN_NAMES.includes(name)).sort(),
        btree: valid.filter((name) => BTREE_NAMES.includes(name)).sort(),
      };
    };

    it('migration 1758800000000 đảo ngược được: down khôi phục ĐÚNG sáu BRIN và gỡ cả năm B-tree', async () => {
      const migration = new LifecycleBtreeIndexes1758800000000();
      // Exercise this migration explicitly: later additive migrations must not change what is reverted here.
      await migration.down(fixture);
      let afterDown: { brin: string[]; btree: string[] };
      try {
        afterDown = await indexState();
      } finally {
        await migration.up(fixture);
      }
      expect(afterDown).toEqual({ brin: BRIN_NAMES, btree: [] });
      expect(await indexState()).toEqual({ brin: [], btree: BTREE_NAMES });
    });

    it('up() chạy lại trên trạng thái đã áp dụng thì không lỗi; một index B-tree INVALID bị dựng lại', async () => {
      // chạy lại lần hai: IF NOT EXISTS + dọn index invalid
      await new LifecycleBtreeIndexes1758800000000().up(fixture);
      expect(await indexState()).toEqual({ brin: [], btree: BTREE_NAMES });

      // mô phỏng CREATE INDEX CONCURRENTLY bị huỷ giữa chừng: index tồn tại nhưng indisvalid = false
      await q(
        `UPDATE pg_index SET indisvalid = false
          WHERE indexrelid = 'idx_refresh_tokens_expires_at'::regclass`,
      );
      expect((await indexState()).btree).not.toContain(
        'idx_refresh_tokens_expires_at',
      );

      await new LifecycleBtreeIndexes1758800000000().up(fixture);

      expect(await indexState()).toEqual({ brin: [], btree: BTREE_NAMES });
    });
  });

  describe('index thật sự phục vụ câu chọn lô của từng quy tắc', () => {
    /** Index kỳ vọng cho từng quy tắc; ép planner bỏ Seq Scan để chứng minh predicate + ORDER BY khớp index. */
    const EXPECTED_INDEX: Record<string, string> = {
      'refresh_tokens:expired': 'idx_refresh_tokens_expires_at',
      'phone_otps:old': 'idx_phone_otps_created_at',
      'match_daily_quotas:old': 'idx_match_daily_quotas_quota_date',
      // khoá chính (quota_date, key_hash) dẫn đầu bằng quota_date nên không cần index riêng
      'guest_match_quotas:old': 'pk_guest_match_quotas',
      'outbox_events:published': 'idx_outbox_events_published_at',
      'outbox_events:dead_letter': 'idx_outbox_events_dead_lettered_at',
      'video_views:old': 'idx_video_views_created_at',
      'video_comments:deleted': 'idx_video_comments_deleted_at',
      'mood_status_events:old': 'idx_mood_status_events_created_at',
    };

    it('mọi quy tắc mới đều có index kỳ vọng và câu xoá lô dùng đúng index đó', async () => {
      resetConfig({ VIDEO_VIEW_RETENTION_DAYS: 180 });
      const jobs = [
        new AuthRetentionJob(ds, configStub, schedulerStub, meter),
        new MatchingRetentionJob(ds, configStub, schedulerStub, meter),
        new EconomyRetentionJob(ds, configStub, schedulerStub, meter),
        new ShortVideoRetentionJob(ds, configStub, schedulerStub, meter),
        new MoodRetentionJob(ds, configStub, schedulerStub, meter),
      ];
      const steps = jobs.flatMap((job) =>
        (job as unknown as { steps(): PurgeStep[] }).steps(),
      );
      expect(steps.map((step) => step.label).sort()).toEqual(
        Object.keys(EXPECTED_INDEX).sort(),
      );

      await q('SET enable_seqscan = off');
      try {
        for (const step of steps) {
          const plan = (
            (await q(`EXPLAIN ${buildDeleteSql(step)}`, [
              1_000,
              ...step.params,
            ])) as Array<{ 'QUERY PLAN': string }>
          )
            .map((row) => row['QUERY PLAN'])
            .join('\n');
          expect(plan).toContain(EXPECTED_INDEX[step.label]);
        }
      } finally {
        await q('RESET enable_seqscan');
      }
    });
  });

  describe('auth: refresh_tokens + phone_otps', () => {
    /** Token đã HẾT HẠN `expiredDaysAgo` ngày (âm = còn hạn), phát hành `ttlDays` ngày trước hạn. */
    const insertToken = async (
      expiredDaysAgo: number,
      ttlDays = 30,
    ): Promise<string> =>
      (
        (await q(
          `INSERT INTO refresh_tokens (user_id, token_hash, family_id, expires_at, created_at)
           VALUES (gen_random_uuid(), md5(random()::text) || md5(random()::text), gen_random_uuid(),
                   now() - make_interval(days => $1::int),
                   now() - make_interval(days => $1::int) - make_interval(days => $2::int))
           RETURNING id`,
          [expiredDaysAgo, ttlDays],
        )) as Array<{ id: string }>
      )[0].id;

    it('xoá token đã HẾT HẠN quá grace(7) ngày (theo expires_at), giữ token còn hạn hoặc mới hết hạn; dry-run không xoá', async () => {
      const old = await insertToken(40);
      const oldest = await insertToken(400);
      const withinGrace = await insertToken(6);
      const valid = await insertToken(-10);
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
      expect(left.sort()).toEqual([withinGrace, valid].sort());
      expect(left).not.toContain(old);
      expect(left).not.toContain(oldest);
    });

    it('đổi AUTH_REFRESH_TTL_DAYS KHÔNG làm xoá nhầm token còn hạn: token phát hành 45 ngày trước nhưng còn 45 ngày hạn được giữ', async () => {
      // Trước đây quy tắc theo created_at < now() - (TTL+grace) nên hạ TTL từ 90 xuống 30 sẽ xoá token này (đăng xuất cưỡng bức).
      const longLived = await insertToken(-45, 90);
      resetConfig({ AUTH_REFRESH_TTL_DAYS: 30 });

      await new AuthRetentionJob(
        ds,
        configStub,
        schedulerStub,
        meter,
      ).runOnce();

      expect(await ids('refresh_tokens')).toEqual([longLived]);
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

    describe('dọn token đã xoay NGAY LÚC xoay (theo họ) — quyết định bảo mật, mặc định tắt', () => {
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
      const replacement = (hash: string) => ({
        tokenHash: hash.repeat(64).slice(0, 64),
        expiresAt: new Date(Date.now() + 30 * 86_400_000),
      });

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
          replacement: replacement('c'),
          purgeRotatedOlderThanDays: 7,
        });

        expect(result).toBe('rotated');
        const left = await ids('refresh_tokens');
        expect(left).not.toContain(stale);
        expect(left).toContain(recentlyRotated);
        expect(left).toContain(current); // vừa được đánh dấu đã xoay (7 ngày nữa mới đủ tuổi dọn)
        expect(left).toContain(otherStale); // họ khác không bị đụng
        expect(await count('refresh_tokens')).toBe(4); // 3 cũ còn lại + 1 token thay thế
      });

      it('purgeRotatedOlderThanDays = 0 (TokenService truyền 0 khi dry-run hoặc chưa chấp nhận đánh đổi) thì không xoá gì khi xoay', async () => {
        const familyId = '66666666-6666-4666-8666-666666666666';
        const stale = await insertFamilyToken({ familyId, rotatedDaysAgo: 10 });
        const current = await insertFamilyToken({
          familyId,
          rotatedDaysAgo: null,
        });

        await adapter().rotate({
          tokenId: current,
          replacement: replacement('z'),
          purgeRotatedOlderThanDays: 0,
        });

        expect(await ids('refresh_tokens')).toContain(stale);
      });

      it('không truyền hạn (dry-run/off hoặc quyết định chưa chấp nhận) thì không xoá gì khi xoay', async () => {
        const familyId = '33333333-3333-4333-8333-333333333333';
        const stale = await insertFamilyToken({ familyId, rotatedDaysAgo: 10 });
        const current = await insertFamilyToken({
          familyId,
          rotatedDaysAgo: null,
        });

        await adapter().rotate({
          tokenId: current,
          replacement: replacement('d'),
        });

        expect(await ids('refresh_tokens')).toContain(stale);
      });

      it('token đã bị dọn mà bị phát lại thì chỉ bị TỪ CHỐI (invalid), không còn thu hồi cả họ — đánh đổi đã ghi ở ADR 0014', async () => {
        const familyId = '44444444-4444-4444-8444-444444444444';
        const stale = await insertFamilyToken({ familyId, rotatedDaysAgo: 10 });
        const current = await insertFamilyToken({
          familyId,
          rotatedDaysAgo: null,
        });
        await adapter().rotate({
          tokenId: current,
          replacement: replacement('e'),
          purgeRotatedOlderThanDays: 7,
        });

        const replay = await adapter().rotate({
          tokenId: stale,
          replacement: replacement('f'),
        });

        expect(replay).toBe('invalid');
        // Họ KHÔNG bị thu hồi: token thay thế vẫn dùng được.
        const revoked = (await q(
          `SELECT count(*)::int AS n FROM refresh_tokens WHERE family_id = $1 AND revoked_at IS NOT NULL`,
          [familyId],
        )) as Array<{ n: number }>;
        expect(revoked[0]?.n).toBe(0);
      });

      it('dọn KHÔNG BAO GIỜ chờ khoá hàng: hàng cũ đang bị giữ bởi giao dịch khác (vd thu hồi họ) được bỏ qua, xoay vẫn hoàn tất', async () => {
        const familyId = '55555555-5555-4555-8555-555555555555';
        const stale = await insertFamilyToken({ familyId, rotatedDaysAgo: 10 });
        const current = await insertFamilyToken({
          familyId,
          rotatedDaysAgo: null,
        });
        const holder = ds.createQueryRunner();
        await holder.connect();
        await holder.startTransaction();
        await holder.query(
          `SELECT id FROM refresh_tokens WHERE id = $1 FOR UPDATE`,
          [stale],
        );
        try {
          const timeout = new Promise<'timeout'>((resolve) =>
            setTimeout(() => resolve('timeout'), 5_000),
          );
          const outcome = await Promise.race([
            adapter().rotate({
              tokenId: current,
              replacement: replacement('g'),
              purgeRotatedOlderThanDays: 7,
            }),
            timeout,
          ]);
          // Nếu việc dọn chờ khoá, xoay treo tới timeout (và có thể thành deadlock với revoke).
          expect(outcome).toBe('rotated');
          expect(await ids('refresh_tokens')).toContain(stale);
        } finally {
          await holder.commitTransaction();
          await holder.release();
        }

        // Lần xoay kế tiếp (khoá đã nhả) dọn nốt hàng đã bỏ qua.
        const next = (await q(
          `SELECT id FROM refresh_tokens WHERE family_id = $1 AND rotated_at IS NULL`,
          [familyId],
        )) as Array<{ id: string }>;
        await adapter().rotate({
          tokenId: (next[0] as { id: string }).id,
          replacement: replacement('h'),
          purgeRotatedOlderThanDays: 7,
        });
        expect(await ids('refresh_tokens')).not.toContain(stale);
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

    it('sổ cái được bảo vệ CẤU TRÚC: không job nào trỏ vào bảng sổ cái/ví/chứng từ và deny-list từ chối dựng SQL cho chúng', () => {
      resetConfig({ VIDEO_VIEW_RETENTION_DAYS: 180 });
      const jobs = [
        new AuthRetentionJob(ds, configStub, schedulerStub, meter),
        new MatchingRetentionJob(ds, configStub, schedulerStub, meter),
        new EconomyRetentionJob(ds, configStub, schedulerStub, meter),
        new ShortVideoRetentionJob(ds, configStub, schedulerStub, meter),
        new MoodRetentionJob(ds, configStub, schedulerStub, meter),
      ];
      const tables = new Set(
        jobs.flatMap((job) =>
          (job as unknown as { steps(): PurgeStep[] })
            .steps()
            .map((step) => step.table),
        ),
      );
      // economy chỉ có outbox_events; không job nào khác có bảng sổ cái.
      const economyTables = (jobs[2] as unknown as { steps(): PurgeStep[] })
        .steps()
        .map((step) => step.table);
      expect(new Set(economyTables)).toEqual(new Set(['outbox_events']));
      for (const table of [
        'transactions',
        'ledger_entries',
        'ledger_accounts',
        'wallets',
        'iap_receipts',
        'payos_payment_orders',
        'gift_events',
        'admin_audit_logs',
      ]) {
        expect(tables.has(table)).toBe(false);
        const step: PurgeStep = {
          label: `${table}:bad`,
          table,
          primaryKey: 'id',
          predicate: 'created_at < now()',
          params: [],
        };
        expect(() => buildDeleteSql(step)).toThrow(/bảo vệ/u);
        expect(() => buildCountSql(step)).toThrow(/bảo vệ/u);
      }
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

  describe('mood: hạn giữ không bao giờ ngắn hơn TTL trạng thái', () => {
    it('MOOD_STATUS_TTL_HOURS=240 (10 ngày) với retention 7 ngày: sự kiện 9 ngày tuổi (trạng thái còn sống) được GIỮ, 12 ngày tuổi bị xoá', async () => {
      await q(
        `INSERT INTO mood_status_events (user_id, kind, idempotency_key, created_at) VALUES
           (gen_random_uuid(), 'clear', 'k-alive', now() - interval '9 days'),
           (gen_random_uuid(), 'clear', 'k-dead', now() - interval '12 days')`,
      );
      resetConfig({ MOOD_STATUS_TTL_HOURS: 240 });

      await new MoodRetentionJob(
        ds,
        configStub,
        schedulerStub,
        meter,
      ).runOnce();

      const rows = (await q(
        `SELECT idempotency_key FROM mood_status_events`,
      )) as Array<{ idempotency_key: string }>;
      expect(rows).toEqual([{ idempotency_key: 'k-alive' }]);
    });
  });

  describe('mood: bảo vệ trạng thái đang hiệu lực khi cấu hình TTL bị giảm', () => {
    const jobRun = () =>
      new MoodRetentionJob(ds, configStub, schedulerStub, meter).runOnce();
    const keys = async (): Promise<string[]> =>
      (
        (await q(
          `SELECT idempotency_key FROM mood_status_events ORDER BY idempotency_key`,
        )) as Array<{ idempotency_key: string }>
      ).map((row) => row.idempotency_key);
    /** `set` với expires_at đã snapshot lúc tạo (không phụ thuộc cấu hình TTL hiện tại). */
    const insertSet = (
      key: string,
      userId: string,
      createdDaysAgo: number,
      expiresInDays: number,
    ) =>
      q(
        `INSERT INTO mood_status_events (user_id, kind, preset_id, expires_at, idempotency_key, created_at)
         VALUES ($1, 'set', gen_random_uuid(), now() + make_interval(days => $2::int), $3,
                 now() - make_interval(days => $4::int))`,
        [userId, expiresInDays, key, createdDaysAgo],
      );
    const insertClear = (key: string, userId: string, createdDaysAgo: number) =>
      q(
        `INSERT INTO mood_status_events (user_id, kind, idempotency_key, created_at)
         VALUES ($1, 'clear', $2, now() - make_interval(days => $3::int))`,
        [userId, key, createdDaysAgo],
      );
    const newUser = async (): Promise<string> =>
      ((await q(`SELECT gen_random_uuid() AS id`)) as Array<{ id: string }>)[0]
        .id;

    it('giảm TTL xuống 24 giờ, retention 1 ngày: mood tạo 3 ngày trước nhưng expires_at snapshot còn 4 ngày NGHĨA LÀ còn hiệu lực → KHÔNG bị xoá; mood đã hết hạn cùng tuổi thì bị xoá', async () => {
      const live = await newUser();
      const dead = await newUser();
      await insertSet('live', live, 3, 4);
      await insertSet('expired', dead, 3, -1);
      resetConfig({ MOOD_STATUS_TTL_HOURS: 24, MOOD_EVENT_RETENTION_DAYS: 1 });

      await jobRun();

      expect(await keys()).toEqual(['live']);
    });

    it('KHÔNG làm mood cũ hiện lại: clear / set-hết-hạn MỚI HƠN đang che một set còn hạn cũ hơn được giữ, dù đã quá tuổi', async () => {
      const user = await newUser();
      await insertSet('a-old-live', user, 6, 2); // còn hiệu lực 2 ngày nữa
      await insertSet('b-expired-set', user, 4, -1); // mới hơn, đã hết hạn
      await insertClear('c-clear', user, 3); // mới nhất: tắt mood
      // một user khác không bị ảnh hưởng: sự kiện cũ của họ vẫn bị xoá
      const other = await newUser();
      await insertClear('other-old', other, 5);
      resetConfig({ MOOD_STATUS_TTL_HOURS: 24, MOOD_EVENT_RETENTION_DAYS: 1 });

      await jobRun();

      // c-clear và b-expired-set đủ tuổi nhưng đang che a-old-live: xoá chúng thì mood a hiện lại
      expect(await keys()).toEqual(['a-old-live', 'b-expired-set', 'c-clear']);
      const current = (await q(
        `SELECT kind FROM mood_status_events WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [user],
      )) as Array<{ kind: string }>;
      expect(current[0]?.kind).toBe('clear'); // mood hiện tại vẫn là "đã tắt"

      // Khi set cũ hết hạn, toàn bộ chuỗi tự đủ điều kiện ở lần quét sau.
      await q(
        `UPDATE mood_status_events SET expires_at = now() - interval '1 minute' WHERE idempotency_key = 'a-old-live'`,
      );
      await jobRun();
      expect(await keys()).toEqual([]);
    });

    it('set còn hạn và clear CÙNG created_at: clear (đang che set) được giữ, mood hiện tại không đổi sau retention', async () => {
      const user = await newUser();
      await q(
        `INSERT INTO mood_status_events (user_id, kind, preset_id, expires_at, idempotency_key, created_at)
         VALUES ($1, 'set', gen_random_uuid(), now() + interval '4 days', 'tie-set', now() - interval '3 days')`,
        [user],
      );
      await q(
        `INSERT INTO mood_status_events (user_id, kind, idempotency_key, created_at)
         SELECT $1, 'clear', 'tie-clear', created_at FROM mood_status_events WHERE idempotency_key = 'tie-set'`,
        [user],
      );
      resetConfig({
        MOOD_STATUS_TTL_HOURS: 24,
        MOOD_EVENT_RETENTION_DAYS: 1,
        RETENTION_BATCH_SIZE: 1,
        RETENTION_MAX_BATCHES_PER_TICK: 10,
      });

      await jobRun();

      expect(await keys()).toEqual(['tie-clear', 'tie-set']);
    });

    it('bảo vệ này giữ nguyên qua ranh giới lô: batch nhỏ hơn số dòng đủ tuổi vẫn không xoá dòng đang che mood còn hạn', async () => {
      const user = await newUser();
      await insertSet('z-live', user, 8, 3);
      for (let index = 0; index < 5; index += 1) {
        await insertClear(`y-clear-${index}`, user, 7 - index);
      }
      resetConfig({
        MOOD_STATUS_TTL_HOURS: 24,
        MOOD_EVENT_RETENTION_DAYS: 1,
        RETENTION_BATCH_SIZE: 2,
        RETENTION_MAX_BATCHES_PER_TICK: 10,
      });

      await jobRun();

      expect(await count('mood_status_events')).toBe(6); // không dòng nào bị xoá
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

    it('shutdown giữa tick: xong lô đang chạy rồi dừng, KHÔNG bắt đầu lô mới (SIGTERM không phải chờ hết ngân sách 30 giây)', async () => {
      await q(
        `INSERT INTO stories (author_user_id, media_url, expires_at, idempotency_key)
         SELECT gen_random_uuid(), 'm', now() - interval '1 hour', 'old-' || g
           FROM generate_series(1, 1300) g`,
      );
      const sweeper = new StorySweeperService(ds, configStub, schedulerStub);
      sweeper.onApplicationShutdown();

      const swept = await sweeper.runOnce();

      // đúng MỘT lô (500) rồi thoát vòng lặp; phần còn lại để pod khác/tick sau
      expect(swept).toBe(500);
      expect(await count('stories')).toBe(800);
    });
  });
});
