import { DataSource } from 'typeorm';

import { SnakeNamingStrategy } from '../../../database/snake-naming.strategy';
import { InitAuthUser1751900000000 } from '../../../database/migrations/1751900000000-init-auth-user';
import { UserProfilePreferences1755800000000 } from '../../../database/migrations/1755800000000-user-profile-preferences';
import { UserRole1753600000000 } from '../../../database/migrations/1753600000000-user-role';
import { Notification1753000000000 } from '../../../database/migrations/1753000000000-notification';
import { RetentionIndexes1758000000000 } from '../../../database/migrations/1758000000000-retention-indexes';
import { buildDeleteSql } from '../../../common/retention/batched-purge';
import { Gender, User } from '../../user';
import { Notification } from '../entities/notification.entity';
import { NotificationRetentionJob } from './notification-retention.job';

import type { ConfigService } from '@nestjs/config';
import type { CoreApiEnv } from '../../../config/env.validation';

/**
 * Integration test retention `notifications` trên Postgres thật (ADR 0013): đúng hàng bị xoá/giữ theo hai
 * quy tắc đã-đọc/chưa-đọc, giới hạn lô mỗi tick, dry-run không xoá, `SKIP LOCKED` không chặn writer, và
 * hai index một phần thực sự phục vụ được câu chọn lô. DB riêng `<tên gốc>_retention`.
 */
const INTEGRATION_DB_URL = process.env['INTEGRATION_DB_URL'];
const d = INTEGRATION_DB_URL ? describe : describe.skip;
if (!INTEGRATION_DB_URL) {
  console.warn(
    '[notification-retention.integration] BỎ QUA — set INTEGRATION_DB_URL để chạy trên Postgres thật',
  );
}

jest.setTimeout(60_000);

const CONFIG: Record<string, unknown> = {};
const configStub = {
  getOrThrow: (key: string) => {
    if (!(key in CONFIG)) throw new Error(`missing config ${key}`);
    return CONFIG[key];
  },
} as unknown as ConfigService<CoreApiEnv, true>;

function resetConfig(over: Record<string, unknown> = {}): void {
  for (const key of Object.keys(CONFIG)) delete CONFIG[key];
  Object.assign(CONFIG, {
    RETENTION_MODE: 'delete',
    RETENTION_INTERVAL_MS: 60_000,
    RETENTION_BATCH_SIZE: 100,
    RETENTION_MAX_BATCHES_PER_TICK: 5,
    RETENTION_BATCH_PAUSE_MS: 0,
    NOTIFICATION_READ_RETENTION_DAYS: 90,
    NOTIFICATION_UNREAD_RETENTION_DAYS: 365,
    ...over,
  });
}

d('Notification retention (Postgres thật)', () => {
  let ds: DataSource;
  let job: NotificationRetentionJob;
  let userId: string;

  /** Notification với `read_at`/`created_at` lùi về quá khứ (null = chưa đọc). */
  async function insertNotification(input: {
    readDaysAgo: number | null;
    createdDaysAgo: number;
  }): Promise<string> {
    const [row] = (await ds.query(
      `INSERT INTO notifications (user_id, type, payload, read_at, created_at)
       VALUES ($1, 'friend_message', '{}'::jsonb,
               CASE WHEN $2::int IS NULL THEN NULL
                    ELSE now() - make_interval(days => $2::int) END,
               now() - make_interval(days => $3::int))
       RETURNING id`,
      [userId, input.readDaysAgo, input.createdDaysAgo],
    )) as Array<{ id: string }>;
    return (row as { id: string }).id;
  }

  // Thứ tự quy tắc xoay vòng giữa các tick (khung RetentionJob) nên so sánh theo nhãn, không theo vị trí.
  const sortedByLabel = <T extends { label: string }>(items: T[]): T[] =>
    [...items].sort((a, b) => a.label.localeCompare(b.label));

  const remaining = async (): Promise<string[]> =>
    (
      (await ds.query(`SELECT id FROM notifications ORDER BY id`)) as Array<{
        id: string;
      }>
    ).map((row) => row.id);

  beforeAll(async () => {
    const url = new URL(INTEGRATION_DB_URL as string);
    const dbName = `${url.pathname.slice(1)}_retention`;
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
      entities: [User, Notification],
      migrations: [
        InitAuthUser1751900000000,
        UserProfilePreferences1755800000000,
        UserRole1753600000000,
        Notification1753000000000,
        RetentionIndexes1758000000000,
      ],
      // Như data-source production: migration retention tạo index CONCURRENTLY nên phải ngoài transaction.
      migrationsTransactionMode: 'each',
      namingStrategy: new SnakeNamingStrategy(),
      synchronize: false,
      dropSchema: true,
    });
    await ds.initialize();
    await ds.runMigrations({ transaction: 'each' });

    const repo = ds.getRepository(User);
    userId = (
      await repo.save(
        repo.create({
          nickname: 'retention-user',
          avatarId: 'default-01',
          isGuest: false,
          region: 'VN',
          birthDate: '2000-01-01',
          gender: Gender.Unknown,
        }),
      )
    ).id;

    job = new NotificationRetentionJob(
      ds,
      configStub,
      { addInterval: () => undefined } as never,
      {
        createCounter: () => ({ add: () => undefined }),
        createGauge: () => ({ record: () => undefined }),
      } as never,
    );
  });

  afterAll(async () => {
    await ds?.destroy();
  });

  beforeEach(async () => {
    resetConfig();
    await ds.query(`DELETE FROM notifications`);
  });

  it('xoá đúng hàng đủ điều kiện theo hai quy tắc, giữ phần còn lại', async () => {
    const readOld = await insertNotification({
      readDaysAgo: 100,
      createdDaysAgo: 120,
    });
    const readOld2 = await insertNotification({
      readDaysAgo: 95,
      createdDaysAgo: 96,
    });
    const readRecent = await insertNotification({
      readDaysAgo: 10,
      createdDaysAgo: 120,
    });
    const unreadOld = await insertNotification({
      readDaysAgo: null,
      createdDaysAgo: 400,
    });
    const unreadRecent = await insertNotification({
      readDaysAgo: null,
      createdDaysAgo: 100,
    });

    const results = await job.runOnce();

    expect(sortedByLabel(results).map((r) => [r.label, r.rows])).toEqual([
      ['notifications:read', 2],
      ['notifications:unread', 1],
    ]);
    const left = await remaining();
    expect(left.sort()).toEqual([readRecent, unreadRecent].sort());
    expect(left).not.toContain(readOld);
    expect(left).not.toContain(readOld2);
    expect(left).not.toContain(unreadOld);
  });

  it('dry-run: báo số hàng đủ điều kiện nhưng KHÔNG xoá gì', async () => {
    resetConfig({ RETENTION_MODE: 'dry-run' });
    await insertNotification({ readDaysAgo: 100, createdDaysAgo: 120 });
    await insertNotification({ readDaysAgo: null, createdDaysAgo: 400 });
    await insertNotification({ readDaysAgo: null, createdDaysAgo: 5 });

    const results = await job.runOnce();

    expect(
      sortedByLabel(results).map((r) => [r.label, r.mode, r.rows]),
    ).toEqual([
      ['notifications:read', 'dry-run', 1],
      ['notifications:unread', 'dry-run', 1],
    ]);
    expect(await remaining()).toHaveLength(3);
  });

  it('mode=off: không chạm dữ liệu', async () => {
    resetConfig({ RETENTION_MODE: 'off' });
    await insertNotification({ readDaysAgo: 1_000, createdDaysAgo: 1_001 });

    await expect(job.runOnce()).resolves.toEqual([]);
    expect(await remaining()).toHaveLength(1);
  });

  it('số ngày = 0 nghĩa là giữ vĩnh viễn quy tắc đó', async () => {
    resetConfig({ NOTIFICATION_READ_RETENTION_DAYS: 0 });
    await insertNotification({ readDaysAgo: 1_000, createdDaysAgo: 1_001 });
    const unreadOld = await insertNotification({
      readDaysAgo: null,
      createdDaysAgo: 900,
    });

    const results = await job.runOnce();

    expect(results.map((r) => r.label)).toEqual(['notifications:unread']);
    const left = await remaining();
    expect(left).toHaveLength(1); // read-cũ được giữ
    expect(left).not.toContain(unreadOld);
  });

  it('giới hạn lô × số lô mỗi tick: backlog xử lý dần qua các tick', async () => {
    resetConfig({
      RETENTION_BATCH_SIZE: 2,
      RETENTION_MAX_BATCHES_PER_TICK: 2,
      NOTIFICATION_UNREAD_RETENTION_DAYS: 0,
    });
    for (let i = 0; i < 7; i += 1) {
      await insertNotification({ readDaysAgo: 100 + i, createdDaysAgo: 200 });
    }

    const first = await job.runOnce();
    expect(first[0]).toMatchObject({ rows: 4, batches: 2, capped: true });
    expect(await remaining()).toHaveLength(3);

    const second = await job.runOnce();
    expect(second[0]).toMatchObject({ rows: 3, batches: 2, capped: false });
    expect(await remaining()).toHaveLength(0);
  });

  it('xoá cũ nhất trước (theo read_at) để lô sau tiếp tục từ hàng cũ', async () => {
    resetConfig({
      RETENTION_BATCH_SIZE: 2,
      RETENTION_MAX_BATCHES_PER_TICK: 1,
      NOTIFICATION_UNREAD_RETENTION_DAYS: 0,
    });
    const oldest = await insertNotification({
      readDaysAgo: 400,
      createdDaysAgo: 401,
    });
    const older = await insertNotification({
      readDaysAgo: 300,
      createdDaysAgo: 301,
    });
    const newer = await insertNotification({
      readDaysAgo: 200,
      createdDaysAgo: 201,
    });
    const newest = await insertNotification({
      readDaysAgo: 100,
      createdDaysAgo: 101,
    });

    await job.runOnce();

    const left = await remaining();
    expect(left.sort()).toEqual([newer, newest].sort());
    expect(left).not.toContain(oldest);
    expect(left).not.toContain(older);
  });

  it('SKIP LOCKED: hàng đang bị writer khoá không bị chờ/xoá, tick sau xoá khi đã nhả khoá', async () => {
    const free = await insertNotification({
      readDaysAgo: 100,
      createdDaysAgo: 120,
    });
    const locked = await insertNotification({
      readDaysAgo: 101,
      createdDaysAgo: 121,
    });
    resetConfig({ NOTIFICATION_UNREAD_RETENTION_DAYS: 0 });

    const writer = ds.createQueryRunner();
    await writer.connect();
    await writer.startTransaction();
    await writer.query(`SELECT 1 FROM notifications WHERE id = $1 FOR UPDATE`, [
      locked,
    ]);
    try {
      const startedAt = Date.now();
      const [result] = await job.runOnce();
      expect(Date.now() - startedAt).toBeLessThan(5_000); // không đợi khoá
      expect(result?.rows).toBe(1);
      const left = await remaining();
      expect(left).toEqual([locked]);
      expect(left).not.toContain(free);
    } finally {
      await writer.rollbackTransaction();
      await writer.release();
    }

    const [after] = await job.runOnce();
    expect(after?.rows).toBe(1);
    expect(await remaining()).toEqual([]);
  });

  it('migration retention: hai index hợp lệ + autovacuum riêng cho bảng có retention', async () => {
    const indexes = (await ds.query(
      `SELECT c.relname AS name, i.indisvalid AS valid
         FROM pg_class c JOIN pg_index i ON i.indexrelid = c.oid
        WHERE c.relname IN ('idx_notifications_read_at',
                            'idx_notifications_unread_created')`,
    )) as Array<{ name: string; valid: boolean }>;
    expect(indexes).toHaveLength(2);
    expect(indexes.every((index) => index.valid)).toBe(true);
    const [table] = (await ds.query(
      `SELECT reloptions FROM pg_class WHERE relname = 'notifications'`,
    )) as Array<{ reloptions: string[] | null }>;
    expect(table?.reloptions).toEqual(
      expect.arrayContaining([
        'autovacuum_vacuum_scale_factor=0.02',
        'autovacuum_analyze_scale_factor=0.02',
      ]),
    );
  });

  it('câu chọn lô thật sự dùng index một phần (không quét tuần tự khi có index)', async () => {
    const plan = async (label: string, days: number): Promise<string> => {
      const step = {
        label,
        table: 'notifications',
        primaryKey: 'id',
        predicate:
          label === 'read'
            ? 'read_at IS NOT NULL AND read_at < now() - make_interval(days => $2)'
            : 'read_at IS NULL AND created_at < now() - make_interval(days => $2)',
        params: [days],
        orderBy: label === 'read' ? 'read_at' : 'created_at',
      };
      const queryRunner = ds.createQueryRunner();
      await queryRunner.connect();
      try {
        await queryRunner.query('SET enable_seqscan = off');
        const rows = (await queryRunner.query(
          `EXPLAIN ${buildDeleteSql(step)}`,
          [100, days],
        )) as Array<{ 'QUERY PLAN': string }>;
        return rows.map((row) => row['QUERY PLAN']).join('\n');
      } finally {
        await queryRunner.release();
      }
    };

    expect(await plan('read', 90)).toContain('idx_notifications_read_at');
    expect(await plan('unread', 365)).toContain(
      'idx_notifications_unread_created',
    );
  });
});
