import { DataSource } from 'typeorm';

import { SnakeNamingStrategy } from '../../database/snake-naming.strategy';
import { InitAuthUser1751900000000 } from '../../database/migrations/1751900000000-init-auth-user';
import { MatchingCore1752200000000 } from '../../database/migrations/1752200000000-matching-core';
import { MatchingGenderPreference1752300000000 } from '../../database/migrations/1752300000000-matching-gender-preference';
import { UserRole1753600000000 } from '../../database/migrations/1753600000000-user-role';
import { Safety1752800000000 } from '../../database/migrations/1752800000000-safety';
import { ReportStatus1753800000000 } from '../../database/migrations/1753800000000-report-status';
import { DiscoveryUsersIndex1754000000000 } from '../../database/migrations/1754000000000-discovery-users-index';

import { DiscoveryService } from './discovery.service';
import { DiscoveryErrors } from './discovery.errors';
import { SafetyService } from '../safety';
import { Block } from '../safety/entities/block.entity';
import { Report, ReportReason } from '../safety/entities/report.entity';
import { Gender, User, UserService } from '../user';

import type { ConfigService } from '@nestjs/config';
import type { CoreApiEnv } from '../../config/env.validation';

/**
 * Integration test Discovery trên Postgres thật (docs/05 § 5.9): browse loại đúng
 * banned/guest/block/report 2 chiều, filter gender/age, keyset cursor không lặp/sót.
 * DB riêng `<tên gốc>_discovery`.
 */
const INTEGRATION_DB_URL = process.env['INTEGRATION_DB_URL'];
const d = INTEGRATION_DB_URL ? describe : describe.skip;
if (!INTEGRATION_DB_URL) {
  console.warn(
    '[discovery.integration] BỎ QUA — set INTEGRATION_DB_URL để chạy bộ test trên Postgres thật',
  );
}

jest.setTimeout(60_000);

const CONFIG: Record<string, unknown> = {
  SAFETY_REMATCH_COOLDOWN_DAYS: 30,
  SAFETY_REPORT_COOLDOWN_DAYS: 7,
  SAFETY_TRUST_PENALTY_PER_REPORT: 5,
  SAFETY_TRUST_PENALTY_DAILY_CAP: 20,
  SAFETY_TRUST_SCORE_FLOOR: 0,
  DISCOVERY_GUEST_VISIBLE: false,
  DISCOVERY_AGE_BUCKETS: '18,25,31,41',
};
const configStub = {
  getOrThrow: (key: string) => {
    if (!(key in CONFIG)) throw new Error(`missing config ${key}`);
    return CONFIG[key];
  },
} as unknown as ConfigService<CoreApiEnv, true>;

d('Discovery integration (Postgres thật)', () => {
  let ds: DataSource;
  let discovery: DiscoveryService;
  let userService: UserService;
  let safety: SafetyService;

  async function createUser(
    nickname: string,
    overrides: Partial<User> = {},
  ): Promise<User> {
    const repo = ds.getRepository(User);
    return repo.save(
      repo.create({
        nickname,
        avatarId: 'default-01',
        isGuest: false,
        region: 'HCM',
        birthDate: '2000-01-01',
        gender: Gender.Female,
        ...overrides,
      }),
    );
  }

  beforeAll(async () => {
    const url = new URL(INTEGRATION_DB_URL as string);
    const dbName = `${url.pathname.slice(1)}_discovery`;
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
      entities: [User, Report, Block],
      migrations: [
        InitAuthUser1751900000000,
        UserRole1753600000000,
        MatchingCore1752200000000,
        MatchingGenderPreference1752300000000,
        Safety1752800000000,
        ReportStatus1753800000000,
        DiscoveryUsersIndex1754000000000,
      ],
      namingStrategy: new SnakeNamingStrategy(),
      synchronize: false,
      dropSchema: true,
    });
    await ds.initialize();
    await ds.runMigrations();

    userService = new UserService(ds.getRepository(User), configStub);
    safety = new SafetyService(
      ds,
      ds.getRepository(Report),
      ds.getRepository(Block),
      userService,
      configStub,
    );
    discovery = new DiscoveryService(userService, safety, configStub);
  });

  afterAll(async () => {
    await ds.destroy();
  });

  it('loại user đang block/bị block 2 chiều khỏi kết quả browse', async () => {
    const [me, blockedByMe, blocksMe, stranger] = await Promise.all([
      createUser('disc-me-block'),
      createUser('disc-blocked-by-me'),
      createUser('disc-blocks-me'),
      createUser('disc-stranger-1'),
    ]);
    await safety.block(me.id, blockedByMe.id);
    await safety.block(blocksMe.id, me.id);

    const page = await discovery.browse(
      { userId: me.id, isGuest: false, role: 'user' },
      { limit: 20 },
    );
    const ids = page.items.map((i) => i.user.id);

    expect(ids).toContain(stranger.id);
    expect(ids).not.toContain(blockedByMe.id);
    expect(ids).not.toContain(blocksMe.id);
    expect(ids).not.toContain(me.id); // tự loại chính mình
  });

  it('loại vĩnh viễn user đã report/bị report — không theo cooldown như matching', async () => {
    const [me, reportedByMe, reportsMe] = await Promise.all([
      createUser('disc-me-report'),
      createUser('disc-reported-by-me'),
      createUser('disc-reports-me'),
    ]);
    await safety.report(me.id, reportedByMe.id, ReportReason.Spam);
    await safety.report(reportsMe.id, me.id, ReportReason.Harassment);

    const page = await discovery.browse(
      { userId: me.id, isGuest: false, role: 'user' },
      { limit: 20 },
    );
    const ids = page.items.map((i) => i.user.id);

    expect(ids).not.toContain(reportedByMe.id);
    expect(ids).not.toContain(reportsMe.id);
  });

  it('filter gender, loại banned và guest mặc định', async () => {
    const viewer = await createUser('disc-viewer-filter');
    const [male, female, guest, banned] = await Promise.all([
      createUser('disc-male', { gender: Gender.Male }),
      createUser('disc-female', { gender: Gender.Female }),
      createUser('disc-guest', { gender: Gender.Female, isGuest: true }),
      createUser('disc-banned', { gender: Gender.Female }),
    ]);
    await ds
      .getRepository(User)
      .update({ id: banned.id }, { status: 'banned' as never });

    const page = await discovery.browse(
      { userId: viewer.id, isGuest: false, role: 'user' },
      { limit: 50, gender: Gender.Female },
    );
    const ids = page.items.map((i) => i.user.id);

    expect(ids).toContain(female.id);
    expect(ids).not.toContain(male.id); // sai gender
    expect(ids).not.toContain(guest.id); // guest mặc định ẩn
    expect(ids).not.toContain(banned.id); // banned luôn ẩn
  });

  it('cursor sai định dạng → DISCOVERY_CURSOR_INVALID, không 500', async () => {
    const viewer = await createUser('disc-viewer-cursor');
    await expect(
      discovery.browse(
        { userId: viewer.id, isGuest: false, role: 'user' },
        { limit: 20, cursor: 'garbage-cursor' },
      ),
    ).rejects.toMatchObject({ code: DiscoveryErrors.CURSOR_INVALID });
  });

  it('phân trang keyset không lặp/sót item khi limit nhỏ hơn tổng số', async () => {
    const viewer = await createUser('disc-viewer-paging');
    // Cô lập nhóm test này khỏi user của các test khác (chạy chung DB, không dọn giữa các it)
    // bằng 1 tuổi chẵn năm riêng biệt lọc qua ageMin=ageMax — region đã bỏ khỏi filter (§ 6 plan).
    const PAGING_AGE = 47;
    const now = new Date();
    const pagingBirthDate = new Date(
      now.getFullYear() - PAGING_AGE,
      now.getMonth(),
      now.getDate(),
    )
      .toISOString()
      .slice(0, 10);
    // Tạo TUẦN TỰ (không Promise.all) — keyset cursor (createdAt, id) cần createdAt phân biệt
    // ở độ phân giải millisecond của JS Date; tạo đồng thời có thể trùng millisecond và không
    // phản ánh kịch bản thật (user không đăng ký cùng millisecond).
    const created: User[] = [];
    for (let i = 0; i < 5; i += 1) {
      created.push(
        await createUser(`disc-paging-${i}`, { birthDate: pagingBirthDate }),
      );
    }

    const seen = new Set<string>();
    let cursor: string | null | undefined;
    do {
      const page = await discovery.browse(
        { userId: viewer.id, isGuest: false, role: 'user' },
        {
          limit: 2,
          ageMin: PAGING_AGE,
          ageMax: PAGING_AGE,
          cursor: cursor ?? undefined,
        },
      );
      for (const item of page.items) seen.add(item.user.id);
      cursor = page.meta.nextCursor;
    } while (cursor);

    expect(seen.size).toBe(created.length);
    for (const u of created) expect(seen.has(u.id)).toBe(true);
  });
});
