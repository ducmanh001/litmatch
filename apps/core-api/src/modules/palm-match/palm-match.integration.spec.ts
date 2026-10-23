import { DataSource } from 'typeorm';

import { SnakeNamingStrategy } from '../../database/snake-naming.strategy';
import { InitAuthUser1751900000000 } from '../../database/migrations/1751900000000-init-auth-user';
import { UserProfilePreferences1755800000000 } from '../../database/migrations/1755800000000-user-profile-preferences';
import { MatchingCore1752200000000 } from '../../database/migrations/1752200000000-matching-core';
import { MatchingGenderPreference1752300000000 } from '../../database/migrations/1752300000000-matching-gender-preference';
import { SoulMatch1752400000000 } from '../../database/migrations/1752400000000-soul-match';
import { FriendChat1752600000000 } from '../../database/migrations/1752600000000-friend-chat';
import { Safety1752800000000 } from '../../database/migrations/1752800000000-safety';
import { PalmMatch1753300000000 } from '../../database/migrations/1753300000000-palm-match';
import { UserRole1753600000000 } from '../../database/migrations/1753600000000-user-role';
import { PalmMatchSession1755500000000 } from '../../database/migrations/1755500000000-palm-match-session';
import { MatchingDailyEntitlements1757100000000 } from '../../database/migrations/1757100000000-matching-daily-entitlements';

import { PalmMatchClientState } from './dto/palm-match.dtos';
import {
  PalmMatchActiveParticipant,
  PalmMatchOutcome,
  PalmMatchQueueEntry,
  PalmMatchRating,
  PalmMatchSession,
} from './entities/palm-match-session.entity';
import { PalmReadingTemplate } from './entities/palm-reading-template.entity';
import { PalmMatchErrors } from './palm-match.errors';
import { PalmMatchService } from './palm-match.service';
import { Conversation } from '../friend/entities/conversation.entity';
import { Friendship } from '../friend/entities/friendship.entity';
import { Message } from '../friend/entities/message.entity';
import { FriendService } from '../friend/friend.service';
import { ConversationService } from '../friend/services/conversation.service';
import { MatchSession } from '../matching/entities/match-session.entity';
import { MatchTicket } from '../matching/entities/match-ticket.entity';
import { Block } from '../safety/entities/block.entity';
import { Report } from '../safety/entities/report.entity';
import { SafetyService } from '../safety/safety.service';
import { SoulChatMessage } from '../soul-match/entities/soul-chat-message.entity';
import { SoulMatchRating } from '../soul-match/entities/soul-match-rating.entity';
import { Gender, User } from '../user';

import type { ConfigService } from '@nestjs/config';
import type { CoreApiEnv } from '../../config/env.validation';
import type { UserService } from '../user';

const INTEGRATION_DB_URL = process.env['INTEGRATION_DB_URL'];
const d = INTEGRATION_DB_URL ? describe : describe.skip;
if (!INTEGRATION_DB_URL) {
  console.warn(
    '[palm-match.integration] BỎ QUA — set INTEGRATION_DB_URL để chạy trên Postgres thật',
  );
}

jest.setTimeout(60_000);

const CONFIG: Record<string, unknown> = {
  PALM_MATCH_TARGET_NAME_MAX_LENGTH: 50,
  PALM_MATCH_QUEUE_MAX_WAIT_SECONDS: 120,
  PALM_MATCH_SESSION_DURATION_SECONDS: 300,
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

d('Palm Match integration (Postgres thật)', () => {
  let ds: DataSource;
  let palmMatch: PalmMatchService;
  let friend: FriendService;
  let safety: SafetyService;

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

  async function pairAndReveal(a: User, b: User): Promise<string> {
    expect((await palmMatch.joinQueue(a.id)).state).toBe(
      PalmMatchClientState.Queued,
    );
    const paired = await palmMatch.joinQueue(b.id);
    expect(paired.state).toBe(PalmMatchClientState.Active);
    const sessionId = paired.sessionId as string;
    await palmMatch.flip(a.id, sessionId);
    await palmMatch.flip(b.id, sessionId);
    return sessionId;
  }

  beforeAll(async () => {
    const url = new URL(INTEGRATION_DB_URL as string);
    const dbName = `${url.pathname.slice(1)}_palm_match`;
    url.pathname = `/${dbName}`;

    const adminUrl = new URL(INTEGRATION_DB_URL as string);
    adminUrl.pathname = '/postgres';
    const admin = new DataSource({
      type: 'postgres',
      url: adminUrl.toString(),
    });
    await admin.initialize();
    const exists = await admin.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
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
        PalmReadingTemplate,
        PalmMatchSession,
        PalmMatchQueueEntry,
        PalmMatchActiveParticipant,
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
        PalmMatch1753300000000,
        PalmMatchSession1755500000000,
      ],
      namingStrategy: new SnakeNamingStrategy(),
      synchronize: false,
      dropSchema: true,
    });
    await ds.initialize();
    await ds.runMigrations();

    const userServiceStub = {
      getByIdOrThrow: async (id: string) => ({ id }),
    } as unknown as UserService;
    safety = new SafetyService(
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
      new ConversationService(
        ds.getRepository(Conversation),
        ds.getRepository(Message),
      ),
      { recordActivity: async () => ({}) } as never,
      safety,
      // stub FriendMessageNotifier — suite này không kiểm tra thông báo tin nhắn
      { notify: async () => undefined } as never,
      configStub,
      { publish: async () => 1 } as never,
    );
    palmMatch = new PalmMatchService(
      ds.getRepository(PalmReadingTemplate),
      configStub,
      ds,
      friend,
      safety,
    );
  });

  afterAll(async () => {
    await ds?.destroy();
  });

  beforeEach(async () => {
    await ds.query(`
      TRUNCATE palm_match_active_participants, palm_match_queue_entries,
        palm_match_sessions, conversations, friendships CASCADE
    `);
  });

  it('queue idempotent + ghép race-safe, snapshot chỉ lộ theo lượt flip', async () => {
    const [a, b, outsider] = await Promise.all([
      createUser('palm-flow-a'),
      createUser('palm-flow-b'),
      createUser('palm-outsider'),
    ]);

    const first = await palmMatch.joinQueue(a.id);
    const replay = await palmMatch.joinQueue(a.id);
    expect(replay.state).toBe(PalmMatchClientState.Queued);
    expect(replay.queuedAt).toBe(first.queuedAt);

    const paired = await palmMatch.joinQueue(b.id);
    const sessionId = paired.sessionId as string;
    expect((await palmMatch.getCurrent(a.id)).sessionId).toBe(sessionId);
    expect(
      await ds.getRepository(PalmMatchQueueEntry).countBy({ userId: a.id }),
    ).toBe(0);

    const aFlipped = await palmMatch.flip(a.id, sessionId);
    expect(aFlipped.mySign).toBeDefined();
    expect(aFlipped.opponentSign).toBeUndefined();
    expect(aFlipped.compatibilityPercent).toBeUndefined();

    const seenByB = await palmMatch.getCurrent(b.id);
    expect(seenByB.mySign).toBeUndefined();
    expect(seenByB.opponentSign).toEqual(aFlipped.mySign);
    await expect(palmMatch.flip(outsider.id, sessionId)).rejects.toMatchObject({
      code: PalmMatchErrors.SESSION_NOT_FOUND,
    });

    const both = await palmMatch.flip(b.id, sessionId);
    expect(both.compatibilityPercent).toBeGreaterThanOrEqual(60);
    expect(both.fortune).toBeTruthy();
    expect((await palmMatch.flip(b.id, sessionId)).fortune).toBe(both.fortune);
  });

  it('mutual-like tạo đúng một Friendship + Conversation và chỉ lúc đó lộ partnerUserId', async () => {
    const [a, b] = await Promise.all([
      createUser('palm-like-a'),
      createUser('palm-like-b'),
    ]);
    const sessionId = await pairAndReveal(a, b);

    const waiting = await palmMatch.rate(a.id, sessionId, PalmMatchRating.Like);
    expect(waiting.state).toBe(PalmMatchClientState.Active);
    expect(waiting.partnerUserId).toBeUndefined();

    const matched = await palmMatch.rate(b.id, sessionId, PalmMatchRating.Like);
    expect(matched).toMatchObject({
      state: PalmMatchClientState.Completed,
      outcome: PalmMatchOutcome.Matched,
      partnerUserId: a.id,
    });
    expect(await friend.areFriends(a.id, b.id)).toBe(true);
    expect(await ds.getRepository(Conversation).count()).toBeGreaterThan(0);

    const replay = await palmMatch.rate(b.id, sessionId, PalmMatchRating.Like);
    expect(replay.outcome).toBe(PalmMatchOutcome.Matched);
    await expect(
      palmMatch.rate(b.id, sessionId, PalmMatchRating.Skip),
    ).rejects.toMatchObject({ code: PalmMatchErrors.RATING_CONFLICT });
    expect(
      await ds.getRepository(Friendship).countBy({
        userLowId: a.id < b.id ? a.id : b.id,
        userHighId: a.id < b.id ? b.id : a.id,
      }),
    ).toBe(1);
  });

  it('skip kết thúc không lộ profile; dismiss giải phóng caller cho lượt mới', async () => {
    const [a, b] = await Promise.all([
      createUser('palm-skip-a'),
      createUser('palm-skip-b'),
    ]);
    const sessionId = await pairAndReveal(a, b);
    const skipped = await palmMatch.rate(a.id, sessionId, PalmMatchRating.Skip);
    expect(skipped).toMatchObject({
      state: PalmMatchClientState.Completed,
      outcome: PalmMatchOutcome.NotMatched,
    });
    expect(skipped.partnerUserId).toBeUndefined();
    expect((await palmMatch.getCurrent(b.id)).outcome).toBe(
      PalmMatchOutcome.NotMatched,
    );

    await palmMatch.dismissCurrent(a.id);
    expect((await palmMatch.joinQueue(a.id)).state).toBe(
      PalmMatchClientState.Queued,
    );
  });

  it('Safety re-check chặn cặp đã block dù A đã enqueue trước', async () => {
    const [a, b] = await Promise.all([
      createUser('palm-block-a'),
      createUser('palm-block-b'),
    ]);
    await palmMatch.joinQueue(a.id);
    await safety.block(a.id, b.id);
    expect((await palmMatch.joinQueue(b.id)).state).toBe(
      PalmMatchClientState.Queued,
    );
    expect((await palmMatch.getCurrent(a.id)).state).toBe(
      PalmMatchClientState.Queued,
    );
  });

  it('deadline server chuyển session sang expired, không cho flip tiếp', async () => {
    const [a, b] = await Promise.all([
      createUser('palm-expire-a'),
      createUser('palm-expire-b'),
    ]);
    CONFIG['PALM_MATCH_SESSION_DURATION_SECONDS'] = -1;
    await palmMatch.joinQueue(a.id);
    const paired = await palmMatch.joinQueue(b.id);
    CONFIG['PALM_MATCH_SESSION_DURATION_SECONDS'] = 300;

    const expired = await palmMatch.getCurrent(a.id);
    expect(expired).toMatchObject({
      state: PalmMatchClientState.Completed,
      outcome: PalmMatchOutcome.Expired,
    });
    await expect(
      palmMatch.flip(a.id, paired.sessionId as string),
    ).rejects.toMatchObject({ code: PalmMatchErrors.SESSION_FINISHED });
  });

  describe('ghép không khoá toàn cục (SKIP LOCKED + tự chữa khi poll)', () => {
    const cleanQueue = () => ds.query(`DELETE FROM palm_match_queue_entries`);

    it('12 user join ĐỒNG THỜI (nhiều hơn pool) → không ai vào hai phiên; vài lượt poll sau tất cả được ghép, hàng đợi trống', async () => {
      await cleanQueue();
      const users = await Promise.all(
        Array.from({ length: 12 }, (_, i) => createUser(`palm-conc-${i}`)),
      );
      const ids = users.map((user) => user.id);

      await Promise.all(users.map((user) => palmMatch.joinQueue(user.id)));
      // Hai người vào cùng lúc có thể bỏ lỡ nhau (đối tác đang bị khoá): người MỚI hơn thử lại ở lượt poll kế tiếp.
      let states = await Promise.all(
        users.map((user) => palmMatch.getCurrent(user.id)),
      );
      for (
        let round = 0;
        round < 10 &&
        states.some((state) => state.state !== PalmMatchClientState.Active);
        round += 1
      ) {
        states = await Promise.all(
          users.map((user) => palmMatch.getCurrent(user.id)),
        );
      }

      expect(states.map((state) => state.state)).toEqual(
        Array(12).fill(PalmMatchClientState.Active),
      );
      expect(new Set(states.map((state) => state.sessionId)).size).toBe(6);
      const perSession = (await ds.query(
        `SELECT session_id, count(*)::int AS n FROM palm_match_active_participants
          WHERE user_id = ANY($1) GROUP BY session_id`,
        [ids],
      )) as Array<{ session_id: string; n: number }>;
      expect(perSession).toHaveLength(6);
      expect(perSession.every((row) => row.n === 2)).toBe(true);
      const [queued] = (await ds.query(
        `SELECT count(*)::int AS n FROM palm_match_queue_entries WHERE user_id = ANY($1)`,
        [ids],
      )) as Array<{ n: number }>;
      expect(queued?.n).toBe(0);
    });

    it('entry đối tác đang bị lượt khác giữ khoá → joiner KHÔNG chờ; khi khoá nhả, lượt poll kế tiếp ghép cặp', async () => {
      await cleanQueue();
      const [a, b] = await Promise.all([
        createUser('palm-lock-a'),
        createUser('palm-lock-b'),
      ]);
      await palmMatch.joinQueue(a.id);

      const holder = ds.createQueryRunner();
      await holder.connect();
      await holder.startTransaction();
      await holder.query(
        `SELECT 1 FROM palm_match_queue_entries WHERE user_id = $1 FOR UPDATE`,
        [a.id],
      );
      try {
        const startedAt = Date.now();
        const bState = await palmMatch.joinQueue(b.id);
        expect(Date.now() - startedAt).toBeLessThan(5_000); // không đợi khoá
        expect(bState.state).toBe(PalmMatchClientState.Queued);
      } finally {
        await holder.rollbackTransaction();
        await holder.release();
      }

      const retry = await palmMatch.getCurrent(b.id);
      expect(retry.state).toBe(PalmMatchClientState.Active);
      expect((await palmMatch.getCurrent(a.id)).sessionId).toBe(
        retry.sessionId,
      );
    });

    it('toàn bộ hàng đợi poll CÙNG LÚC vẫn ghép được (không ai khoá hàng của mình khi tìm, nên không bỏ qua nhau)', async () => {
      await cleanQueue();
      const users = await Promise.all(
        Array.from({ length: 8 }, (_, i) => createUser(`palm-storm-${i}`)),
      );
      for (const user of users) {
        await ds.query(
          `INSERT INTO palm_match_queue_entries (user_id, queued_at) VALUES ($1, clock_timestamp())`,
          [user.id],
        );
      }

      const states = await Promise.all(
        users.map((user) => palmMatch.getCurrent(user.id)),
      );

      const active = states.filter(
        (state) => state.state === PalmMatchClientState.Active,
      );
      expect(active.length).toBeGreaterThanOrEqual(2);
    });

    it('hai bên đã nằm sẵn trong hàng đợi (bỏ lỡ nhau) → poll cả hai thì ghép được', async () => {
      await cleanQueue();
      const [a, b] = await Promise.all([
        createUser('palm-heal-a'),
        createUser('palm-heal-b'),
      ]);
      await ds.query(
        `INSERT INTO palm_match_queue_entries (user_id) VALUES ($1), ($2)`,
        [a.id, b.id],
      );

      await palmMatch.getCurrent(a.id);
      await palmMatch.getCurrent(b.id);
      const finalA = await palmMatch.getCurrent(a.id);
      const finalB = await palmMatch.getCurrent(b.id);

      expect(finalA.state).toBe(PalmMatchClientState.Active);
      expect(finalB.state).toBe(PalmMatchClientState.Active);
      expect(finalA.sessionId).toBe(finalB.sessionId);
    });

    it('hai lượt join ĐỒNG THỜI của CÙNG một user: lượt sau trả đúng phiên vừa ghép, không để lại entry thừa trong hàng đợi', async () => {
      await cleanQueue();
      const [older, user] = await Promise.all([
        createUser('palm-dup-older'),
        createUser('palm-dup-user'),
      ]);
      await palmMatch.joinQueue(older.id); // người cũ hơn đang chờ
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
      const target = palmMatch as unknown as Record<
        string,
        (...args: unknown[]) => Promise<unknown>
      >;
      const original = target['createSessionSnapshot'].bind(palmMatch);
      const spy = jest
        .spyOn(target, 'createSessionSnapshot')
        .mockImplementation(async (...args: unknown[]) => {
          reached();
          await releasePromise;
          return original(...args);
        });
      let first: Promise<{ state: string; sessionId?: string }>;
      let second: Promise<{ state: string; sessionId?: string }>;
      try {
        first = palmMatch.joinQueue(user.id);
        await reachedPromise;
        second = palmMatch.joinQueue(user.id);
        // Cho lượt 2 chạy tới điểm chờ (khoá/ghi) trong lúc lượt 1 chưa commit.
        await new Promise((resolve) => setTimeout(resolve, 300));
        release();
        const [r1, r2] = await Promise.all([first, second]);
        expect(r1.state).toBe(PalmMatchClientState.Active);
        expect(r2.state).toBe(PalmMatchClientState.Active);
        expect(r2.sessionId).toBe(r1.sessionId);
      } finally {
        release();
        spy.mockRestore();
      }
      const [row] = (await ds.query(
        `SELECT count(*)::int AS n FROM palm_match_queue_entries WHERE user_id = ANY($1)`,
        [[older.id, user.id]],
      )) as Array<{ n: number }>;
      expect(row?.n).toBe(0);
    });

    it('dọn entry quá hạn có chặn 50/lượt, không đụng entry còn hạn', async () => {
      await cleanQueue();
      const stale = await Promise.all(
        Array.from({ length: 60 }, (_, i) => createUser(`palm-stale-${i}`)),
      );
      await ds.query(
        `INSERT INTO palm_match_queue_entries (user_id, queued_at)
         SELECT unnest($1::uuid[]), now() - interval '1 day'`,
        [stale.map((user) => user.id)],
      );
      const joiner = await createUser('palm-purge-a');
      const second = await createUser('palm-purge-b');
      const staleLeft = async (): Promise<number> => {
        const [row] = (await ds.query(
          `SELECT count(*)::int AS n FROM palm_match_queue_entries WHERE queued_at < now() - interval '1 hour'`,
        )) as Array<{ n: number }>;
        return row?.n ?? -1;
      };

      await palmMatch.joinQueue(joiner.id);
      expect(await staleLeft()).toBe(10); // 60 − 50
      await palmMatch.joinQueue(second.id);
      expect(await staleLeft()).toBe(0);
    });
  });
  it('join replay vẫn trả phiên active khi một user KHÁC ghép mình sau lần kiểm tra trạng thái đầu tiên; không để lại hàng queue thừa', async () => {
    const [b, d] = await Promise.all([
      createUser('palm-race-b'),
      createUser('palm-race-d'),
    ]);
    expect((await palmMatch.joinQueue(b.id)).state).toBe(
      PalmMatchClientState.Queued,
    );
    // Dừng B NGAY SAU lần đọc "chưa active" đầu tiên của lượt join lặp; D join và ghép B; rồi thả B.
    type ActiveStateFn = (manager: unknown, userId: string) => Promise<unknown>;
    const internals = palmMatch as unknown as { activeState: ActiveStateFn };
    const original = internals.activeState.bind(palmMatch);
    let observed!: () => void;
    let resume!: () => void;
    let blocked = false;
    const checked = new Promise<void>((resolve) => {
      observed = resolve;
    });
    const allowed = new Promise<void>((resolve) => {
      resume = resolve;
    });
    const spy = jest
      .spyOn(internals, 'activeState')
      .mockImplementation(async (manager, userId) => {
        const active = await original(manager, userId);
        if (userId === b.id && !active && !blocked) {
          blocked = true;
          observed();
          await allowed;
        }
        return active;
      });
    let replay: Promise<{ state: PalmMatchClientState }> | undefined;
    try {
      replay = palmMatch.joinQueue(b.id);
      const outcome = replay.then(
        (value) => ({ value }),
        (error: unknown) => ({ error }),
      );
      await checked;
      const paired = await palmMatch.joinQueue(d.id);
      expect(paired.state).toBe(PalmMatchClientState.Active);
      resume();

      const result = await outcome;
      expect('error' in result).toBe(false);
      expect(
        (result as { value: { state: PalmMatchClientState } }).value.state,
      ).toBe(PalmMatchClientState.Active);
      expect(
        await ds.getRepository(PalmMatchQueueEntry).countBy({ userId: b.id }),
      ).toBe(0);
    } finally {
      resume();
      await replay?.catch(() => undefined);
      spy.mockRestore();
    }
  });
});
