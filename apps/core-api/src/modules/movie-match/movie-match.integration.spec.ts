import { DataSource } from 'typeorm';

import { SnakeNamingStrategy } from '../../database/snake-naming.strategy';
import { InitAuthUser1751900000000 } from '../../database/migrations/1751900000000-init-auth-user';
import { UserRole1753600000000 } from '../../database/migrations/1753600000000-user-role';
import { MatchingCore1752200000000 } from '../../database/migrations/1752200000000-matching-core';
import { MatchingGenderPreference1752300000000 } from '../../database/migrations/1752300000000-matching-gender-preference';
import { SoulMatch1752400000000 } from '../../database/migrations/1752400000000-soul-match';
import { FriendChat1752600000000 } from '../../database/migrations/1752600000000-friend-chat';
import { Safety1752800000000 } from '../../database/migrations/1752800000000-safety';
import { ReportTargetVideo1754900000000 } from '../../database/migrations/1754900000000-report-target-video';
import { MovieMatch1753200000000 } from '../../database/migrations/1753200000000-movie-match';

import { MovieMatchErrors } from './movie-match.errors';
import { MovieMatchService } from './movie-match.service';
import { MovieSessionActiveParticipant } from './entities/movie-session-active-participant.entity';
import {
  MovieSession,
  MovieSessionStatus,
} from './entities/movie-session.entity';
import { Conversation } from '../friend/entities/conversation.entity';
import {
  Friendship,
  FriendshipSource,
} from '../friend/entities/friendship.entity';
import { Message } from '../friend/entities/message.entity';
import { ConversationService } from '../friend/services/conversation.service';
import { FriendService } from '../friend/friend.service';
import { MatchSession } from '../matching/entities/match-session.entity';
import { MatchTicket } from '../matching/entities/match-ticket.entity';
import { SafetyService } from '../safety';
import { Block } from '../safety/entities/block.entity';
import { Report } from '../safety/entities/report.entity';
import { SoulChatMessage } from '../soul-match/entities/soul-chat-message.entity';
import { SoulMatchRating } from '../soul-match/entities/soul-match-rating.entity';
import { Gender, User } from '../user';

import type { UserService } from '../user';
import type { ConfigService } from '@nestjs/config';
import type { CoreApiEnv } from '../../config/env.validation';

/**
 * Integration test Movie Match trên Postgres thật (docs/05 § 5.9): race/concurrency của
 * partial unique index (2 request tạo session đồng thời cùng cặp → chỉ 1 row, không 500) +
 * luồng tạo → update state → end. DB riêng `<tên gốc>_movie_match`.
 */
const INTEGRATION_DB_URL = process.env['INTEGRATION_DB_URL'];
const d = INTEGRATION_DB_URL ? describe : describe.skip;
if (!INTEGRATION_DB_URL) {
  console.warn(
    '[movie-match.integration] BỎ QUA — set INTEGRATION_DB_URL để chạy bộ test trên Postgres thật',
  );
}

jest.setTimeout(60_000);

const CONFIG: Record<string, unknown> = {
  MOVIE_MATCH_URL_MAX_LENGTH: 2048,
  MOVIE_MATCH_ALLOWED_VIDEO_HOSTS: 'youtube.com,youtu.be',
  FRIEND_MESSAGE_MAX_LENGTH: 2000,
  SAFETY_REMATCH_COOLDOWN_DAYS: 30,
  SAFETY_REPORT_COOLDOWN_DAYS: 7,
  SAFETY_TRUST_PENALTY_PER_REPORT: 5,
  SAFETY_TRUST_PENALTY_DAILY_CAP: 20,
  SAFETY_TRUST_SCORE_FLOOR: 0,
};
const configStub = {
  getOrThrow: (key: string) => {
    if (!(key in CONFIG)) throw new Error(`missing config ${key}`);
    return CONFIG[key];
  },
} as unknown as ConfigService<CoreApiEnv, true>;

d('Movie Match integration (Postgres thật)', () => {
  let ds: DataSource;
  let movieMatch: MovieMatchService;
  let friend: FriendService;

  async function createUser(nickname: string): Promise<User> {
    const repo = ds.getRepository(User);
    return repo.save(
      repo.create({
        nickname,
        avatarId: 'default-01',
        isGuest: false,
        region: 'VN',
        birthDate: '2000-01-01',
        gender: Gender.Unknown,
      }),
    );
  }

  async function makeFriends(a: User, b: User): Promise<void> {
    await ds.transaction((manager) =>
      friend.ensureFriendship(manager, a.id, b.id, FriendshipSource.SoulMatch),
    );
  }

  beforeAll(async () => {
    const url = new URL(INTEGRATION_DB_URL as string);
    const dbName = `${url.pathname.slice(1)}_movie_match`;
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
      entities: [
        User,
        MatchTicket,
        MatchSession,
        SoulChatMessage,
        SoulMatchRating,
        Friendship,
        Conversation,
        Message,
        Report,
        Block,
        MovieSession,
        MovieSessionActiveParticipant,
      ],
      migrations: [
        InitAuthUser1751900000000,
        UserRole1753600000000,
        MatchingCore1752200000000,
        MatchingGenderPreference1752300000000,
        SoulMatch1752400000000,
        FriendChat1752600000000,
        Safety1752800000000,
        ReportTargetVideo1754900000000,
        MovieMatch1753200000000,
      ],
      namingStrategy: new SnakeNamingStrategy(),
      synchronize: false,
      dropSchema: true,
    });
    await ds.initialize();
    await ds.runMigrations();

    const conversationService = new ConversationService(
      ds.getRepository(Conversation),
      ds.getRepository(Message),
    );
    const userServiceStub = {
      getByIdOrThrow: async (id: string) => ({ id }),
    } as unknown as UserService;
    const safety = new SafetyService(
      ds,
      ds.getRepository(Report),
      ds.getRepository(Block),
      userServiceStub,
      configStub,
    );
    friend = new FriendService(
      ds.getRepository(Friendship),
      conversationService,
      // stub — suite này chỉ dùng ensureFriendship/areFriends, không gọi sendMessage/streak
      {
        recordActivity: async () => ({ streak: {}, milestoneHit: null }),
      } as never,
      safety,
      {
        create: async () => ({ id: 'notif-stub' }),
        sendPush: async () => undefined,
      } as never,
      configStub,
      { publish: async () => 1 } as never,
    );
    movieMatch = new MovieMatchService(
      ds,
      ds.getRepository(MovieSession),
      friend,
      configStub,
      // stub publish — realtime end-to-end đã test ở suite signaling-gateway
      { publish: async () => 1 } as never,
    );
  });

  afterAll(async () => {
    await ds?.destroy();
  });

  it('không phải bạn → 404 NOT_FRIEND, không tạo row', async () => {
    const [a, b] = await Promise.all([createUser('nf-a'), createUser('nf-b')]);
    await expect(
      movieMatch.createSession(a.id, b.id, 'https://youtube.com/watch?v=1'),
    ).rejects.toMatchObject({ code: MovieMatchErrors.NOT_FRIEND });
    expect(await ds.getRepository(MovieSession).count()).toBe(0);
  });

  it('tạo session mới cho 2 bạn, gọi lại cùng cặp → idempotent trả ĐÚNG session cũ', async () => {
    const [a, b] = await Promise.all([createUser('cr-a'), createUser('cr-b')]);
    await makeFriends(a, b);

    const first = await movieMatch.createSession(
      a.id,
      b.id,
      'https://youtube.com/watch?v=1',
    );
    const second = await movieMatch.createSession(
      b.id,
      a.id,
      'https://youtube.com/watch?v=2', // videoUrl khác — vẫn phải trả lại session CŨ, không tạo mới
    );
    expect(second.id).toBe(first.id);
    expect(second.videoUrl).toBe(first.videoUrl);

    const count = await ds
      .getRepository(MovieSession)
      .countBy({ status: MovieSessionStatus.Active });
    expect(count).toBe(1);
  });

  it('RACE: 2 request tạo session song song CÙNG cặp → đúng 1 row active, không lỗi 500', async () => {
    const [a, b] = await Promise.all([
      createUser('race-a'),
      createUser('race-b'),
    ]);
    await makeFriends(a, b);

    const results = await Promise.allSettled([
      movieMatch.createSession(a.id, b.id, 'https://youtube.com/watch?v=1'),
      movieMatch.createSession(a.id, b.id, 'https://youtube.com/watch?v=1'),
    ]);
    // Cả 2 phải thành công (idempotent) — KHÔNG được có promise reject vì lỗi hệ thống/unique violation lộ ra ngoài
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
    const ids = results.map(
      (r) => (r as PromiseFulfilledResult<MovieSession>).value.id,
    );
    expect(ids[0]).toBe(ids[1]);

    const [low, high] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
    const count = await ds.getRepository(MovieSession).countBy({
      userLowId: low,
      userHighId: high,
      status: MovieSessionStatus.Active,
    });
    expect(count).toBe(1);
  });

  it('đang active với 1 bạn → tạo với BẠN KHÁC → 409 ALREADY_ACTIVE, không tự kết thúc session cũ', async () => {
    const [a, b, c] = await Promise.all([
      createUser('conf-a'),
      createUser('conf-b'),
      createUser('conf-c'),
    ]);
    await Promise.all([makeFriends(a, b), makeFriends(a, c)]);

    const withB = await movieMatch.createSession(
      a.id,
      b.id,
      'https://youtube.com/watch?v=1',
    );
    await expect(
      movieMatch.createSession(a.id, c.id, 'https://youtube.com/watch?v=2'),
    ).rejects.toMatchObject({ code: MovieMatchErrors.ALREADY_ACTIVE });

    // Session với B vẫn active nguyên vẹn — không bị auto-end
    const stillActive = await movieMatch.getSession(a.id, withB.id);
    expect(stillActive.status).toBe(MovieSessionStatus.Active);
  });

  it('luồng đầy đủ: tạo → update state → end; IDOR trả CÙNG 404 cho người ngoài', async () => {
    const [a, b, outsider] = await Promise.all([
      createUser('flow-a'),
      createUser('flow-b'),
      createUser('flow-out'),
    ]);
    await makeFriends(a, b);

    const session = await movieMatch.createSession(
      a.id,
      b.id,
      'https://youtu.be/xyz',
    );
    expect(session.status).toBe(MovieSessionStatus.Active);
    expect(session.isPlaying).toBe(false);

    const updated = await movieMatch.updateState(b.id, session.id, 87.5, true);
    expect(updated.positionSeconds).toBe(87.5);
    expect(updated.isPlaying).toBe(true);

    const polled = await movieMatch.getSession(a.id, session.id);
    expect(polled.positionSeconds).toBe(87.5);
    expect(polled.isPlaying).toBe(true);

    const ended = await movieMatch.endSession(a.id, session.id);
    expect(ended.status).toBe(MovieSessionStatus.Ended);
    expect(ended.endReason).toBe('left');
    expect(ended.endedAt).not.toBeNull();

    // Update state trên session đã ended → 409 ENDED
    await expect(
      movieMatch.updateState(a.id, session.id, 1, false),
    ).rejects.toMatchObject({ code: MovieMatchErrors.ENDED });

    // IDOR: người ngoài không phải participant → CÙNG 404 NOT_FOUND
    await expect(
      movieMatch.getSession(outsider.id, session.id),
    ).rejects.toMatchObject({ code: MovieMatchErrors.NOT_FOUND });
    await expect(
      movieMatch.updateState(outsider.id, session.id, 1, false),
    ).rejects.toMatchObject({ code: MovieMatchErrors.NOT_FOUND });
    await expect(
      movieMatch.endSession(outsider.id, session.id),
    ).rejects.toMatchObject({ code: MovieMatchErrors.NOT_FOUND });

    // Sau khi ended, có thể tạo lại phiên MỚI cho cùng cặp (partial unique index chỉ áp cho active)
    const restarted = await movieMatch.createSession(
      a.id,
      b.id,
      'https://youtube.com/watch?v=new',
    );
    expect(restarted.id).not.toBe(session.id);
    expect(restarted.status).toBe(MovieSessionStatus.Active);
  });

  it('videoUrl domain ngoài whitelist (kể cả giả mạo subdomain) → 422, không tạo row', async () => {
    const [a, b] = await Promise.all([
      createUser('bad-url-a'),
      createUser('bad-url-b'),
    ]);
    await makeFriends(a, b);

    await expect(
      movieMatch.createSession(a.id, b.id, 'https://youtube.com.evil.com/x'),
    ).rejects.toMatchObject({ code: MovieMatchErrors.INVALID_VIDEO_URL });
    await expect(
      movieMatch.createSession(a.id, b.id, 'https://evil.com/phishing'),
    ).rejects.toMatchObject({ code: MovieMatchErrors.INVALID_VIDEO_URL });

    const count = await ds
      .getRepository(MovieSession)
      .countBy({ userLowId: a.id < b.id ? a.id : b.id });
    expect(count).toBe(0);
  });
});
