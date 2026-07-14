import { DataSource } from 'typeorm';

import { SnakeNamingStrategy } from '../../database/snake-naming.strategy';
import { InitAuthUser1751900000000 } from '../../database/migrations/1751900000000-init-auth-user';
import { MatchingCore1752200000000 } from '../../database/migrations/1752200000000-matching-core';
import { MatchingGenderPreference1752300000000 } from '../../database/migrations/1752300000000-matching-gender-preference';
import { UserRole1753600000000 } from '../../database/migrations/1753600000000-user-role';
import { Safety1752800000000 } from '../../database/migrations/1752800000000-safety';
import { ReportTargetVideo1754900000000 } from '../../database/migrations/1754900000000-report-target-video';
import { ReportStatus1753800000000 } from '../../database/migrations/1753800000000-report-status';
import { Mood1754100000000 } from '../../database/migrations/1754100000000-mood';

import { MoodService } from './mood.service';
import { MoodErrors } from './mood.errors';
import { MoodPreset } from './entities/mood-preset.entity';
import { MoodStatusEvent } from './entities/mood-status-event.entity';
import { SafetyService } from '../safety';
import { Block } from '../safety/entities/block.entity';
import { Report } from '../safety/entities/report.entity';
import { User, UserService } from '../user';

import type { ConfigService } from '@nestjs/config';
import type { CoreApiEnv } from '../../config/env.validation';

/**
 * Integration test Mood trên Postgres thật (docs/05 § 5.9): idempotency-key unique thật ở DB
 * (không chỉ mock), derive "mood hiện tại" đúng qua nhiều dòng append-only, ẩn 2 chiều khi block.
 * DB riêng `<tên gốc>_mood`.
 */
const INTEGRATION_DB_URL = process.env['INTEGRATION_DB_URL'];
const d = INTEGRATION_DB_URL ? describe : describe.skip;
if (!INTEGRATION_DB_URL) {
  console.warn(
    '[mood.integration] BỎ QUA — set INTEGRATION_DB_URL để chạy bộ test trên Postgres thật',
  );
}

jest.setTimeout(60_000);

const CONFIG: Record<string, unknown> = {
  SAFETY_REMATCH_COOLDOWN_DAYS: 30,
  SAFETY_REPORT_COOLDOWN_DAYS: 7,
  SAFETY_TRUST_PENALTY_PER_REPORT: 5,
  SAFETY_TRUST_PENALTY_DAILY_CAP: 20,
  SAFETY_TRUST_SCORE_FLOOR: 0,
  MOOD_STATUS_TTL_HOURS: 24,
};
const configStub = {
  getOrThrow: (key: string) => {
    if (!(key in CONFIG)) throw new Error(`missing config ${key}`);
    return CONFIG[key];
  },
} as unknown as ConfigService<CoreApiEnv, true>;

d('Mood integration (Postgres thật)', () => {
  let ds: DataSource;
  let mood: MoodService;
  let happyPresetId: string;

  async function createUser(nickname: string): Promise<User> {
    const repo = ds.getRepository(User);
    return repo.save(
      repo.create({
        nickname,
        avatarId: 'default-01',
        isGuest: false,
        birthDate: '2000-01-01',
      }),
    );
  }

  beforeAll(async () => {
    const url = new URL(INTEGRATION_DB_URL as string);
    const dbName = `${url.pathname.slice(1)}_mood`;
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
      entities: [User, Report, Block, MoodPreset, MoodStatusEvent],
      migrations: [
        InitAuthUser1751900000000,
        UserRole1753600000000,
        MatchingCore1752200000000,
        MatchingGenderPreference1752300000000,
        Safety1752800000000,
        ReportTargetVideo1754900000000,
        ReportStatus1753800000000,
        Mood1754100000000,
      ],
      namingStrategy: new SnakeNamingStrategy(),
      synchronize: false,
      dropSchema: true,
    });
    await ds.initialize();
    await ds.runMigrations();

    const userService = new UserService(ds.getRepository(User), configStub);
    const safety = new SafetyService(
      ds,
      ds.getRepository(Report),
      ds.getRepository(Block),
      userService,
      configStub,
    );
    mood = new MoodService(
      ds.getRepository(MoodPreset),
      ds.getRepository(MoodStatusEvent),
      safety,
      configStub,
    );

    const happy = await ds
      .getRepository(MoodPreset)
      .findOneByOrFail({ code: 'happy' });
    happyPresetId = happy.id;
  });

  afterAll(async () => {
    await ds.destroy();
  });

  it('preset không tồn tại/tắt → MOOD_PRESET_NOT_FOUND', async () => {
    const u = await createUser('mood-unknown-preset');
    await expect(
      mood.setMood(u.id, 'not-a-real-preset', 'k-1'),
    ).rejects.toMatchObject({ code: MoodErrors.PRESET_NOT_FOUND });
  });

  it('set rồi getMyMood trả đúng preset vừa set', async () => {
    const u = await createUser('mood-set-basic');
    const result = await mood.setMood(u.id, 'happy', 'k-2');
    expect(result.preset.id).toBe(happyPresetId);

    const current = await mood.getMyMood(u.id);
    expect(current?.preset.id).toBe(happyPresetId);
  });

  it('idempotency-key trùng (retry mạng) → không tạo 2 dòng, trả lại cùng 1 kết quả', async () => {
    const u = await createUser('mood-idempotent');
    const first = await mood.setMood(u.id, 'happy', 'same-key');
    const second = await mood.setMood(u.id, 'happy', 'same-key');
    expect(second.setAt.getTime()).toBe(first.setAt.getTime());

    const count = await ds
      .getRepository(MoodStatusEvent)
      .countBy({ userId: u.id });
    expect(count).toBe(1);
  });

  it('clear rồi getMyMood → null dù mood set trước đó vẫn còn hạn', async () => {
    const u = await createUser('mood-clear');
    await mood.setMood(u.id, 'happy', 'k-3');
    await mood.clearMood(u.id, 'k-4');
    expect(await mood.getMyMood(u.id)).toBeNull();
  });

  it('set lại sau khi clear → có mood trở lại (dòng mới nhất quyết định, không bị "khoá" bởi clear cũ)', async () => {
    const u = await createUser('mood-reset-after-clear');
    await mood.setMood(u.id, 'happy', 'k-5');
    await mood.clearMood(u.id, 'k-6');
    await mood.setMood(u.id, 'chill', 'k-7');

    const current = await mood.getMyMood(u.id);
    expect(current?.preset.code).toBe('chill');
  });

  it('mood đã hết hạn (expiresAt quá khứ) → derive null khi đọc, không cần cron dọn', async () => {
    const u = await createUser('mood-expired');
    await mood.setMood(u.id, 'happy', 'k-8');
    // Giả lập "đã hết hạn từ lâu" — set thẳng expiresAt về quá khứ (pattern party-room grace test)
    await ds
      .getRepository(MoodStatusEvent)
      .update({ userId: u.id }, { expiresAt: new Date(Date.now() - 1000) });

    expect(await mood.getMyMood(u.id)).toBeNull();
  });

  it('getPublicMood ẩn 2 chiều khi có block — cả 2 hướng', async () => {
    const [blocker, blocked, stranger] = await Promise.all([
      createUser('mood-blocker'),
      createUser('mood-blocked'),
      createUser('mood-stranger'),
    ]);
    await mood.setMood(blocked.id, 'happy', 'k-9');
    await mood.setMood(blocker.id, 'chill', 'k-10');

    const safety = new SafetyService(
      ds,
      ds.getRepository(Report),
      ds.getRepository(Block),
      new UserService(ds.getRepository(User), configStub),
      configStub,
    );
    await safety.block(blocker.id, blocked.id);

    // Hướng 1: blocker xem blocked → ẩn
    expect(await mood.getPublicMood(blocker.id, blocked.id)).toBeNull();
    // Hướng 2 (ngược lại): blocked xem blocker → cũng ẩn (2 chiều)
    expect(await mood.getPublicMood(blocked.id, blocker.id)).toBeNull();
    // Không liên quan tới cặp block → vẫn thấy nhau bình thường
    expect(await mood.getPublicMood(stranger.id, blocked.id)).not.toBeNull();
  });
});
