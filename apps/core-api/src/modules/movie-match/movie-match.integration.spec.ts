import { DataSource } from 'typeorm';

import { SnakeNamingStrategy } from '../../database/snake-naming.strategy';
import { InitAuthUser1751900000000 } from '../../database/migrations/1751900000000-init-auth-user';
import { UserProfilePreferences1755800000000 } from '../../database/migrations/1755800000000-user-profile-preferences';
import { UserRole1753600000000 } from '../../database/migrations/1753600000000-user-role';
import { MatchingCore1752200000000 } from '../../database/migrations/1752200000000-matching-core';
import { MatchingGenderPreference1752300000000 } from '../../database/migrations/1752300000000-matching-gender-preference';
import { SoulMatch1752400000000 } from '../../database/migrations/1752400000000-soul-match';
import { FriendChat1752600000000 } from '../../database/migrations/1752600000000-friend-chat';
import { Safety1752800000000 } from '../../database/migrations/1752800000000-safety';
import { ReportTargetVideo1754900000000 } from '../../database/migrations/1754900000000-report-target-video';
import { MovieMatch1753200000000 } from '../../database/migrations/1753200000000-movie-match';
import { MovieMatchAnon1755900000000 } from '../../database/migrations/1755900000000-movie-match-anon';
import { MovieMatchQueueOrderIndex1758100000000 } from '../../database/migrations/1758100000000-movie-match-queue-order-index';
import { MatchingDailyEntitlements1757100000000 } from '../../database/migrations/1757100000000-matching-daily-entitlements';

import { MovieMatchErrors } from './movie-match.errors';
import {
  MovieMatchClientState,
  MovieMatchService,
} from './movie-match.service';
import {
  MovieMatchQueueEntry,
  MovieSessionMessage,
} from './entities/movie-match-anon.entities';
import { MovieSessionActiveParticipant } from './entities/movie-session-active-participant.entity';
import {
  MovieMatchOutcome,
  MovieMatchRating,
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
  MOVIE_MATCH_ANON_VIDEO_URLS:
    'https://www.youtube.com/watch?v=anon1,https://www.youtube.com/watch?v=anon2',
  MOVIE_MATCH_ANON_DURATION_SECONDS: 1080,
  MOVIE_MATCH_QUEUE_MAX_WAIT_SECONDS: 120,
  MOVIE_MATCH_MESSAGE_MAX_LENGTH: 20,
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
        MovieMatchQueueEntry,
        MovieSessionMessage,
      ],
      migrations: [
        InitAuthUser1751900000000,
        UserProfilePreferences1755800000000,
        UserRole1753600000000,
        MatchingCore1752200000000,
        MatchingGenderPreference1752300000000,
        MatchingDailyEntitlements1757100000000,
        SoulMatch1752400000000,
        FriendChat1752600000000,
        Safety1752800000000,
        ReportTargetVideo1754900000000,
        MovieMatch1753200000000,
        MovieMatchAnon1755900000000,
        MovieMatchQueueOrderIndex1758100000000,
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
      // member state (read/mute) không dùng ở suite này — stub rỗng
      { findOne: async () => null } as never,
      conversationService,
      // stub — suite này chỉ dùng ensureFriendship/areFriends, không gọi sendMessage/streak
      {
        recordActivity: async () => ({ streak: {}, milestoneHit: null }),
      } as never,
      safety,
      // stub FriendMessageNotifier — suite này không gọi sendMessage
      { notify: async () => undefined } as never,
      configStub,
      { publish: async () => 1 } as never,
    );
    movieMatch = new MovieMatchService(
      ds,
      ds.getRepository(MovieSession),
      ds.getRepository(MovieSessionMessage),
      friend,
      safety,
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

  describe('flow ghép ẨN DANH (movie-match.html)', () => {
    it('2 user queue → ghép: video server chọn từ pool, KHÔNG leak partnerUserId, expiresAt có deadline', async () => {
      const [a, b] = await Promise.all([
        createUser('anon-a'),
        createUser('anon-b'),
      ]);
      const first = await movieMatch.joinAnonQueue(a.id);
      expect(first.state).toBe(MovieMatchClientState.Queued);
      // Replay queue idempotent — vẫn queued, không lỗi
      expect((await movieMatch.joinAnonQueue(a.id)).state).toBe(
        MovieMatchClientState.Queued,
      );

      const paired = await movieMatch.joinAnonQueue(b.id);
      expect(paired.state).toBe(MovieMatchClientState.Watching);
      expect(paired.videoUrl).toMatch(/anon[12]/); // server chọn từ pool config
      expect(paired.partnerUserId).toBeUndefined(); // ẨN DANH
      expect(paired.expiresAt).toBeDefined();

      const aState = await movieMatch.getAnonCurrent(a.id);
      expect(aState.state).toBe(MovieMatchClientState.Watching);
      expect(aState.sessionId).toBe(paired.sessionId);
      expect(aState.partnerUserId).toBeUndefined();
    });

    describe('ghép không khoá toàn cục (SKIP LOCKED + tự chữa khi poll)', () => {
      const cleanQueue = () =>
        ds.query(`DELETE FROM movie_match_queue_entries`);

      it('12 user join ĐỒNG THỜI (nhiều hơn pool) → không ai vào hai phiên; vài lượt poll sau tất cả được ghép, hàng đợi trống', async () => {
        await cleanQueue();
        const users = await Promise.all(
          Array.from({ length: 12 }, (_, i) => createUser(`conc-${i}`)),
        );
        const ids = users.map((user) => user.id);

        await Promise.all(
          users.map((user) => movieMatch.joinAnonQueue(user.id)),
        );
        // Hai người vào cùng lúc có thể bỏ lỡ nhau (đối tác đang bị khoá): người MỚI hơn thử lại ở lượt poll kế tiếp.
        let states = await Promise.all(
          users.map((user) => movieMatch.getAnonCurrent(user.id)),
        );
        for (
          let round = 0;
          round < 10 &&
          states.some(
            (state) => state.state !== MovieMatchClientState.Watching,
          );
          round += 1
        ) {
          states = await Promise.all(
            users.map((user) => movieMatch.getAnonCurrent(user.id)),
          );
        }

        expect(states.map((state) => state.state)).toEqual(
          Array(12).fill(MovieMatchClientState.Watching),
        );
        expect(new Set(states.map((state) => state.sessionId)).size).toBe(6);
        const perSession = (await ds.query(
          `SELECT session_id, count(*)::int AS n FROM movie_session_active_participants
            WHERE user_id = ANY($1) GROUP BY session_id`,
          [ids],
        )) as Array<{ session_id: string; n: number }>;
        expect(perSession).toHaveLength(6);
        expect(perSession.every((row) => row.n === 2)).toBe(true);
        const [queued] = (await ds.query(
          `SELECT count(*)::int AS n FROM movie_match_queue_entries WHERE user_id = ANY($1)`,
          [ids],
        )) as Array<{ n: number }>;
        expect(queued?.n).toBe(0);
      });

      it('entry đối tác đang bị lượt khác giữ khoá → joiner KHÔNG chờ; khi khoá nhả, lượt poll kế tiếp ghép cặp', async () => {
        await cleanQueue();
        const [a, b] = await Promise.all([
          createUser('lock-a'),
          createUser('lock-b'),
        ]);
        await movieMatch.joinAnonQueue(a.id);

        const holder = ds.createQueryRunner();
        await holder.connect();
        await holder.startTransaction();
        await holder.query(
          `SELECT 1 FROM movie_match_queue_entries WHERE user_id = $1 FOR UPDATE`,
          [a.id],
        );
        try {
          const startedAt = Date.now();
          const bState = await movieMatch.joinAnonQueue(b.id);
          expect(Date.now() - startedAt).toBeLessThan(5_000); // không đợi khoá
          expect(bState.state).toBe(MovieMatchClientState.Queued);
        } finally {
          await holder.rollbackTransaction();
          await holder.release();
        }

        const retry = await movieMatch.getAnonCurrent(b.id);
        expect(retry.state).toBe(MovieMatchClientState.Watching);
        expect((await movieMatch.getAnonCurrent(a.id)).sessionId).toBe(
          retry.sessionId,
        );
      });

      it('hai bên đã nằm sẵn trong hàng đợi (bỏ lỡ nhau) → một lượt poll là ghép được', async () => {
        await cleanQueue();
        const [a, b] = await Promise.all([
          createUser('heal-a'),
          createUser('heal-b'),
        ]);
        await ds.query(
          `INSERT INTO movie_match_queue_entries (user_id) VALUES ($1), ($2)`,
          [a.id, b.id],
        );

        // Chỉ người MỚI hơn (theo queued_at, user_id) giành người cũ hơn — poll cả hai thì đúng một bên ghép được.
        await movieMatch.getAnonCurrent(a.id);
        await movieMatch.getAnonCurrent(b.id);
        const finalA = await movieMatch.getAnonCurrent(a.id);
        const finalB = await movieMatch.getAnonCurrent(b.id);

        expect(finalA.state).toBe(MovieMatchClientState.Watching);
        expect(finalB.state).toBe(MovieMatchClientState.Watching);
        expect(finalA.sessionId).toBe(finalB.sessionId);
      });

      it('toàn bộ hàng đợi poll CÙNG LÚC vẫn ghép được (không ai khoá hàng của mình khi tìm, nên không bỏ qua nhau)', async () => {
        await cleanQueue();
        const users = await Promise.all(
          Array.from({ length: 8 }, (_, i) => createUser(`storm-${i}`)),
        );
        // Nạp sẵn cả 8 vào hàng đợi (queued_at khác nhau) rồi bắn poll đồng loạt một lượt duy nhất.
        for (const user of users) {
          await ds.query(
            `INSERT INTO movie_match_queue_entries (user_id, queued_at) VALUES ($1, clock_timestamp())`,
            [user.id],
          );
        }

        const states = await Promise.all(
          users.map((user) => movieMatch.getAnonCurrent(user.id)),
        );

        // Một lượt đồng loạt phải tạo được ít nhất một cặp (trước đây: mỗi người khoá hàng mình → không ai ghép)
        const watching = states.filter(
          (state) => state.state === MovieMatchClientState.Watching,
        );
        expect(watching.length).toBeGreaterThanOrEqual(2);
      });

      it('hai lượt join ĐỒNG THỜI của CÙNG một user: lượt sau trả đúng phiên vừa ghép, không để lại entry thừa trong hàng đợi', async () => {
        await cleanQueue();
        const [older, user] = await Promise.all([
          createUser('movie-dup-older'),
          createUser('movie-dup-user'),
        ]);
        await movieMatch.joinAnonQueue(older.id); // người cũ hơn đang chờ
        await new Promise((resolve) => setTimeout(resolve, 10));

        // Giữ lượt 1 ngay SAU khi nó đã xoá entry của chính mình (chốt ghép) nhưng TRƯỚC khi commit — đúng lúc user
        // bấm lần hai / mở tab thứ hai.
        let reached!: () => void;
        const reachedPromise = new Promise<void>(
          (resolve) => (reached = resolve),
        );
        let release!: () => void;
        const releasePromise = new Promise<void>(
          (resolve) => (release = resolve),
        );
        const target = movieMatch as unknown as Record<
          string,
          (...args: unknown[]) => Promise<unknown>
        >;
        const original = target['createAnonSession'].bind(movieMatch);
        const spy = jest
          .spyOn(target, 'createAnonSession')
          .mockImplementation(async (...args: unknown[]) => {
            reached();
            await releasePromise;
            return original(...args);
          });
        let first: Promise<{ state: string; sessionId?: string }>;
        let second: Promise<{ state: string; sessionId?: string }>;
        try {
          first = movieMatch.joinAnonQueue(user.id);
          await reachedPromise;
          second = movieMatch.joinAnonQueue(user.id);
          // Cho lượt 2 chạy tới điểm chờ (khoá/ghi) trong lúc lượt 1 chưa commit.
          await new Promise((resolve) => setTimeout(resolve, 300));
          release();
          const [r1, r2] = await Promise.all([first, second]);
          expect(r1.state).toBe(MovieMatchClientState.Watching);
          expect(r2.state).toBe(MovieMatchClientState.Watching);
          expect(r2.sessionId).toBe(r1.sessionId);
        } finally {
          release();
          spy.mockRestore();
        }
        const [row] = (await ds.query(
          `SELECT count(*)::int AS n FROM movie_match_queue_entries WHERE user_id = ANY($1)`,
          [[older.id, user.id]],
        )) as Array<{ n: number }>;
        expect(row?.n).toBe(0);
      });

      it('dọn entry quá hạn có chặn 50/lượt, không đụng entry còn hạn', async () => {
        await cleanQueue();
        await ds.query(
          `INSERT INTO movie_match_queue_entries (user_id, queued_at)
           SELECT gen_random_uuid(), now() - interval '1 day' FROM generate_series(1, 60)`,
        );
        const joiner = await createUser('purge-a');
        const second = await createUser('purge-b');
        const staleLeft = async (): Promise<number> => {
          const [row] = (await ds.query(
            `SELECT count(*)::int AS n FROM movie_match_queue_entries WHERE queued_at < now() - interval '1 hour'`,
          )) as Array<{ n: number }>;
          return row?.n ?? -1;
        };

        await movieMatch.joinAnonQueue(joiner.id);
        expect(await staleLeft()).toBe(10); // 60 − 50
        await movieMatch.joinAnonQueue(second.id);
        expect(await staleLeft()).toBe(0);
      });

      it('migration: index (queued_at, user_id) hợp lệ và câu chọn ứng viên dùng được nó', async () => {
        const queryRunner = ds.createQueryRunner();
        await queryRunner.connect();
        try {
          await queryRunner.query('SET enable_seqscan = off');
          const rows = (await queryRunner.query(
            `EXPLAIN SELECT c.user_id FROM movie_match_queue_entries c
              WHERE (c.queued_at, c.user_id) < (
                      SELECT o.queued_at, o.user_id FROM movie_match_queue_entries o WHERE o.user_id = $1
                    )
                AND c.queued_at >= $2 AND c.user_id <> ALL($3::uuid[])
              ORDER BY c.queued_at ASC, c.user_id ASC LIMIT 1 FOR UPDATE OF c SKIP LOCKED`,
            ['00000000-0000-4000-8000-000000000000', new Date(0), []],
          )) as Array<{ 'QUERY PLAN': string }>;
          expect(rows.map((row) => row['QUERY PLAN']).join('\n')).toContain(
            'idx_movie_match_queue_order',
          );
        } finally {
          await queryRunner.release();
        }
      });
    });

    it('chat trong phiên: idempotent replay, sender vai trò tương đối, quá dài 422, non-member 404', async () => {
      const [a, b, outsider] = await Promise.all([
        createUser('chat-a'),
        createUser('chat-b'),
        createUser('chat-out'),
      ]);
      await movieMatch.joinAnonQueue(a.id);
      const paired = await movieMatch.joinAnonQueue(b.id);
      const sessionId = paired.sessionId as string;

      const m1 = await movieMatch.sendAnonMessage(a.id, sessionId, 'hi', 'k1');
      const replay = await movieMatch.sendAnonMessage(
        a.id,
        sessionId,
        'hi',
        'k1',
      );
      expect(replay.id).toBe(m1.id);
      await expect(
        movieMatch.sendAnonMessage(a.id, sessionId, 'khac noi dung', 'k1'),
      ).rejects.toMatchObject({
        code: MovieMatchErrors.MESSAGE_IDEMPOTENCY_CONFLICT,
      });
      await expect(
        movieMatch.sendAnonMessage(a.id, sessionId, 'x'.repeat(21), 'k2'),
      ).rejects.toMatchObject({ code: MovieMatchErrors.MESSAGE_TOO_LONG });
      await expect(
        movieMatch.listAnonMessages(outsider.id, sessionId, 10),
      ).rejects.toMatchObject({ code: MovieMatchErrors.NOT_FOUND });

      const page = await movieMatch.listAnonMessages(b.id, sessionId, 10);
      expect(page.items).toHaveLength(1);
      expect(page.items[0].senderUserId).toBe(a.id);
    });

    it('rate trước khi xem xong → 409 RATING_NOT_OPEN; finish → rating; mutual-like tạo ĐÚNG 1 Friendship+Conversation, mở partnerUserId', async () => {
      const [a, b] = await Promise.all([
        createUser('like-a'),
        createUser('like-b'),
      ]);
      await movieMatch.joinAnonQueue(a.id);
      const paired = await movieMatch.joinAnonQueue(b.id);
      const sessionId = paired.sessionId as string;

      await expect(
        movieMatch.rateAnon(a.id, sessionId, MovieMatchRating.Like),
      ).rejects.toMatchObject({ code: MovieMatchErrors.RATING_NOT_OPEN });

      const finished = await movieMatch.endAnonWatch(a.id, sessionId);
      expect(finished.state).toBe(MovieMatchClientState.Rating);
      // Idempotent — gọi lại không lỗi
      await movieMatch.endAnonWatch(b.id, sessionId);

      const aRated = await movieMatch.rateAnon(
        a.id,
        sessionId,
        MovieMatchRating.Like,
      );
      expect(aRated.state).toBe(MovieMatchClientState.Rating);
      expect(aRated.partnerUserId).toBeUndefined(); // chưa mutual

      const bRated = await movieMatch.rateAnon(
        b.id,
        sessionId,
        MovieMatchRating.Like,
      );
      expect(bRated.state).toBe(MovieMatchClientState.Completed);
      expect(bRated.outcome).toBe(MovieMatchOutcome.Matched);
      expect(bRated.partnerUserId).toBe(a.id); // matched → mở danh tính

      const [low, high] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
      const friendships = await ds
        .getRepository(Friendship)
        .findBy({ userLowId: low, userHighId: high });
      expect(friendships).toHaveLength(1);
      expect(friendships[0].source).toBe(FriendshipSource.MovieMatch);
      const conversations = await ds
        .getRepository(Conversation)
        .findBy({ userLowId: low, userHighId: high });
      expect(conversations).toHaveLength(1);

      // Đổi rating đã chốt → 409; replay cùng giá trị → OK
      await expect(
        movieMatch.rateAnon(a.id, sessionId, MovieMatchRating.Boring),
      ).rejects.toMatchObject({ code: MovieMatchErrors.RATING_CONFLICT });
      expect(
        (await movieMatch.rateAnon(a.id, sessionId, MovieMatchRating.Like))
          .outcome,
      ).toBe(MovieMatchOutcome.Matched);
    });

    it('một bên rate boring/rude → terminal not_matched ngay, KHÔNG friendship, không leak', async () => {
      const [a, b] = await Promise.all([
        createUser('skip-a'),
        createUser('skip-b'),
      ]);
      await movieMatch.joinAnonQueue(a.id);
      const paired = await movieMatch.joinAnonQueue(b.id);
      const sessionId = paired.sessionId as string;
      await movieMatch.endAnonWatch(a.id, sessionId);

      const rated = await movieMatch.rateAnon(
        a.id,
        sessionId,
        MovieMatchRating.Boring,
      );
      expect(rated.state).toBe(MovieMatchClientState.Completed);
      expect(rated.outcome).toBe(MovieMatchOutcome.NotMatched);
      expect(rated.partnerUserId).toBeUndefined();

      const [low, high] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
      expect(
        await ds
          .getRepository(Friendship)
          .countBy({ userLowId: low, userHighId: high }),
      ).toBe(0);
    });

    it('dismiss: đang active → huỷ cho CẢ HAI; caller được giải phóng để queue lượt mới', async () => {
      const [a, b] = await Promise.all([
        createUser('dis-a'),
        createUser('dis-b'),
      ]);
      await movieMatch.joinAnonQueue(a.id);
      const paired = await movieMatch.joinAnonQueue(b.id);
      const sessionId = paired.sessionId as string;

      expect((await movieMatch.dismissAnonCurrent(a.id)).state).toBe(
        MovieMatchClientState.Idle,
      );
      // Bên B thấy terminal cancelled, dismiss xong cũng tự do
      const bState = await movieMatch.getAnonCurrent(b.id);
      expect(bState.state).toBe(MovieMatchClientState.Completed);
      expect(bState.outcome).toBe(MovieMatchOutcome.Cancelled);
      await movieMatch.dismissAnonCurrent(b.id);

      // A queue lại được ngay (đã giải phóng active-participant)
      expect((await movieMatch.joinAnonQueue(a.id)).state).toBe(
        MovieMatchClientState.Queued,
      );
      await movieMatch.dismissAnonCurrent(a.id);
      expect(
        await ds.getRepository(MovieSession).countBy({ id: sessionId }),
      ).toBe(1);
    });

    it('hết giờ (expiresAt) → lazy chuyển sang rating, playback update bị chặn', async () => {
      const [a, b] = await Promise.all([
        createUser('exp-a'),
        createUser('exp-b'),
      ]);
      await movieMatch.joinAnonQueue(a.id);
      const paired = await movieMatch.joinAnonQueue(b.id);
      const sessionId = paired.sessionId as string;

      // Ép deadline về quá khứ — giả lập hết 18:00
      await ds
        .getRepository(MovieSession)
        .update({ id: sessionId }, { expiresAt: new Date(Date.now() - 1000) });

      const state = await movieMatch.getAnonCurrent(a.id);
      expect(state.state).toBe(MovieMatchClientState.Rating);
      await expect(
        movieMatch.updateAnonState(a.id, sessionId, 10, true),
      ).rejects.toMatchObject({ code: MovieMatchErrors.ENDED });
      // Rating vẫn mở sau khi hết giờ
      const rated = await movieMatch.rateAnon(
        a.id,
        sessionId,
        MovieMatchRating.Rude,
      );
      expect(rated.outcome).toBe(MovieMatchOutcome.NotMatched);
    });

    it('reaction: emoji ngoài whitelist 422; hợp lệ publish cho cả hai (không persist)', async () => {
      const [a, b] = await Promise.all([
        createUser('re-a'),
        createUser('re-b'),
      ]);
      await movieMatch.joinAnonQueue(a.id);
      const paired = await movieMatch.joinAnonQueue(b.id);
      const sessionId = paired.sessionId as string;

      await expect(
        movieMatch.sendAnonReaction(a.id, sessionId, '🔥'),
      ).rejects.toMatchObject({ code: MovieMatchErrors.REACTION_INVALID });
      await expect(
        movieMatch.sendAnonReaction(a.id, sessionId, '😂'),
      ).resolves.toBeUndefined();
    });
  });
});
