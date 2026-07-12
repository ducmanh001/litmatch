import { DataSource } from 'typeorm';

import { SnakeNamingStrategy } from '../../database/snake-naming.strategy';
import { InitAuthUser1751900000000 } from '../../database/migrations/1751900000000-init-auth-user';
import { EconomyLedger1752000000000 } from '../../database/migrations/1752000000000-economy-ledger';
import { EconomyRefund1752100000000 } from '../../database/migrations/1752100000000-economy-refund';
import { MatchingCore1752200000000 } from '../../database/migrations/1752200000000-matching-core';
import { MatchingGenderPreference1752300000000 } from '../../database/migrations/1752300000000-matching-gender-preference';
import { SoulMatch1752400000000 } from '../../database/migrations/1752400000000-soul-match';
import { FriendChat1752600000000 } from '../../database/migrations/1752600000000-friend-chat';

import { SoulMatchService } from './soul-match.service';
import { SoulMatchErrors } from './soul-match.errors';
import { SoulChatMessage } from './entities/soul-chat-message.entity';
import {
  SoulMatchRating,
  SoulMatchVerdict,
} from './entities/soul-match-rating.entity';
import {
  Conversation,
  FriendService,
  Friendship,
  FriendshipSource,
  Message,
} from '../friend';
import { ConversationService } from '../friend/services/conversation.service';
import { MatchingService } from '../matching';
import {
  MatchTicket,
  MatchTicketStatus,
  MatchType,
} from '../matching/entities/match-ticket.entity';
import {
  MatchSession,
  MatchSessionStatus,
} from '../matching/entities/match-session.entity';
import { Gender, User, UserService } from '../user';

import type { ConfigService } from '@nestjs/config';

import type { CoreApiEnv } from '../../config/env.validation';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

/**
 * Integration test Soul Match trên Postgres thật (docs/05 § 5.9) — trọng tâm là race
 * "2 rating like song song chỉ tạo đúng 1 Friendship" (docs/services/soul-match-service.md § 3)
 * và các chốt chặn DB (unique rating/message/friendship, CHECK canonical).
 *
 * LƯU Ý DB: KHÔNG dùng chung database với các suite integration khác — tất cả đều
 * dropSchema:true và Jest chạy song song theo worker. DB của suite này = `<tên gốc>_soulmatch`.
 * Không cần Redis: Soul Match không đụng queue store.
 */
const INTEGRATION_DB_URL = process.env['INTEGRATION_DB_URL'];
const d = INTEGRATION_DB_URL ? describe : describe.skip;
if (!INTEGRATION_DB_URL) {
  console.warn(
    '[soul-match.integration] BỎ QUA — set INTEGRATION_DB_URL để chạy bộ test race trên Postgres thật',
  );
}

jest.setTimeout(60_000);

const CONFIG: Record<string, unknown> = {
  SOUL_CHAT_DURATION_SECONDS: 150,
  SOUL_RATING_WINDOW_SECONDS: 120,
  SOUL_CHAT_MESSAGE_MAX_LENGTH: 500,
  USER_DEFAULT_AVATAR_ID: 'default-01',
  AUTH_MIN_AGE: 18,
};
const configStub = {
  getOrThrow: (key: string) => {
    if (!(key in CONFIG)) throw new Error(`missing config ${key}`);
    return CONFIG[key];
  },
  get: (key: string) => CONFIG[key],
} as unknown as ConfigService<CoreApiEnv, true>;

d('Soul Match integration (Postgres thật)', () => {
  let ds: DataSource;
  let service: SoulMatchService;
  let friendService: FriendService;

  const auth = (userId: string): AuthenticatedUser => ({
    userId,
    isGuest: false,
  });

  let seedCounter = 0;

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

  /** Session soul đã confirmed cách đây `confirmedAgoSeconds` giây (kèm 2 ticket hợp lệ). */
  async function createSoulSession(
    userA: User,
    userB: User,
    confirmedAgoSeconds = 0,
    matchType: MatchType = MatchType.Soul,
    status: MatchSessionStatus = MatchSessionStatus.Confirmed,
  ): Promise<MatchSession> {
    seedCounter += 1;
    const ticketRepo = ds.getRepository(MatchTicket);
    const makeTicket = (user: User, tag: string): MatchTicket =>
      ticketRepo.create({
        userId: user.id,
        matchType,
        region: 'VN',
        ageBand: 5,
        status: MatchTicketStatus.Confirmed,
        enqueuedAt: new Date(),
        priorityBoostMs: 0,
        sessionId: null,
        idempotencyKey: `soul-it:${seedCounter}:${tag}:${user.id}`,
      });
    const ticketA = await ticketRepo.save(makeTicket(userA, 'a'));
    const ticketB = await ticketRepo.save(makeTicket(userB, 'b'));

    const confirmedAt = new Date(Date.now() - confirmedAgoSeconds * 1000);
    const sessionRepo = ds.getRepository(MatchSession);
    return sessionRepo.save(
      sessionRepo.create({
        matchType,
        userAId: userA.id,
        userBId: userB.id,
        ticketAId: ticketA.id,
        ticketBId: ticketB.id,
        status,
        confirmedAAt: new Date(confirmedAt.getTime() - 1000),
        confirmedBAt: confirmedAt,
        endedAt: null,
      }),
    );
  }

  async function friendshipCount(): Promise<number> {
    return ds.getRepository(Friendship).count();
  }

  beforeAll(async () => {
    // DB RIÊNG cho suite: đổi database của INTEGRATION_DB_URL thành `<tên gốc>_soulmatch`
    const url = new URL(INTEGRATION_DB_URL as string);
    const dbName = `${url.pathname.slice(1)}_soulmatch`;
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
      ],
      migrations: [
        InitAuthUser1751900000000,
        EconomyLedger1752000000000,
        EconomyRefund1752100000000,
        MatchingCore1752200000000,
        MatchingGenderPreference1752300000000,
        SoulMatch1752400000000,
        FriendChat1752600000000,
      ],
      namingStrategy: new SnakeNamingStrategy(),
      synchronize: false,
      dropSchema: true, // DB test riêng — làm sạch mỗi lần chạy
    });
    await ds.initialize();
    await ds.runMigrations();

    const userService = new UserService(ds.getRepository(User), configStub);
    const conversationService = new ConversationService(
      ds.getRepository(Conversation),
      ds.getRepository(Message),
    );
    friendService = new FriendService(
      ds.getRepository(Friendship),
      conversationService,
      configStub,
      // stub publish — luồng realtime friend.message test riêng ở suite friend.integration
      { publish: async () => 1 } as never,
    );
    // MatchingService chỉ dùng findSessionById ở đây — các dependency khác không chạm tới
    const matchingService = new MatchingService(
      ds,
      ds.getRepository(MatchTicket),
      userService,
      {} as never,
      configStub,
      {} as never,
    );
    service = new SoulMatchService(
      ds,
      ds.getRepository(SoulChatMessage),
      ds.getRepository(SoulMatchRating),
      matchingService,
      friendService,
      userService,
      configStub,
      // stub publish — luồng realtime end-to-end test ở suite signaling-gateway
      { publish: async () => 1 } as never,
    );
  });

  afterAll(async () => {
    await ds?.destroy();
  });

  it('RACE: 2 rating "like" song song → cả 2 thành công, đúng 1 Friendship (lock session + unique DB)', async () => {
    const [a, b] = await Promise.all([
      createUser('race-a'),
      createUser('race-b'),
    ]);
    const session = await createSoulSession(a, b);
    const before = await friendshipCount();

    const [ra, rb] = await Promise.all([
      service.rate(auth(a.id), session.id, { verdict: SoulMatchVerdict.Like }),
      service.rate(auth(b.id), session.id, { verdict: SoulMatchVerdict.Like }),
    ]);

    expect(ra.verdict).toBe(SoulMatchVerdict.Like);
    expect(rb.verdict).toBe(SoulMatchVerdict.Like);
    // bên rate SAU (được lock nhường) phải thấy mutual like — ít nhất 1 bên matched
    expect(ra.matched || rb.matched).toBe(true);
    expect(await friendshipCount()).toBe(before + 1);
    expect(await friendService.areFriends(a.id, b.id)).toBe(true);
  });

  it('mutual like tuần tự: unlock profile 2 chiều, session view trả matched + myVerdict đúng', async () => {
    const [a, b] = await Promise.all([
      createUser('seq-a'),
      createUser('seq-b'),
    ]);
    const session = await createSoulSession(a, b);

    const first = await service.rate(auth(a.id), session.id, {
      verdict: SoulMatchVerdict.Like,
    });
    expect(first.matched).toBe(false);
    // trước khi B like: profile còn khoá
    await expect(
      service.getPartnerProfile(auth(a.id), session.id),
    ).rejects.toMatchObject({ code: SoulMatchErrors.PARTNER_LOCKED });

    const second = await service.rate(auth(b.id), session.id, {
      verdict: SoulMatchVerdict.Like,
    });
    expect(second.matched).toBe(true);

    const [profileForA, profileForB] = await Promise.all([
      service.getPartnerProfile(auth(a.id), session.id),
      service.getPartnerProfile(auth(b.id), session.id),
    ]);
    expect(profileForA.id).toBe(b.id);
    expect(profileForB.id).toBe(a.id);

    const view = await service.getSessionView(auth(a.id), session.id);
    expect(view.matched).toBe(true);
    expect(view.myVerdict).toBe(SoulMatchVerdict.Like);
  });

  it('like + boring → KHÔNG friendship, profile vẫn khoá; verdict đối phương không leak qua view', async () => {
    const [a, b] = await Promise.all([createUser('nb-a'), createUser('nb-b')]);
    const session = await createSoulSession(a, b);
    const before = await friendshipCount();

    await service.rate(auth(a.id), session.id, {
      verdict: SoulMatchVerdict.Like,
    });
    await service.rate(auth(b.id), session.id, {
      verdict: SoulMatchVerdict.Boring,
    });

    expect(await friendshipCount()).toBe(before);
    await expect(
      service.getPartnerProfile(auth(a.id), session.id),
    ).rejects.toMatchObject({ code: SoulMatchErrors.PARTNER_LOCKED });
    // A chỉ thấy verdict CỦA MÌNH — không có trường nào lộ verdict của B
    const view = await service.getSessionView(auth(a.id), session.id);
    expect(view.myVerdict).toBe(SoulMatchVerdict.Like);
    expect(view.matched).toBe(false);
  });

  it('rating immutable: replay cùng verdict idempotent (1 dòng), đổi verdict → RATING_CONFLICT', async () => {
    const [a, b] = await Promise.all([createUser('im-a'), createUser('im-b')]);
    const session = await createSoulSession(a, b);

    await service.rate(auth(a.id), session.id, {
      verdict: SoulMatchVerdict.Boring,
    });
    const replay = await service.rate(auth(a.id), session.id, {
      verdict: SoulMatchVerdict.Boring,
    });
    expect(replay.verdict).toBe(SoulMatchVerdict.Boring);

    await expect(
      service.rate(auth(a.id), session.id, { verdict: SoulMatchVerdict.Like }),
    ).rejects.toMatchObject({ code: SoulMatchErrors.RATING_CONFLICT });

    const rows = await ds
      .getRepository(SoulMatchRating)
      .countBy({ sessionId: session.id, raterUserId: a.id });
    expect(rows).toBe(1);
  });

  it('cặp đã là bạn match lại lần 2: mutual like không vỡ, vẫn 1 friendship, matched=true ngay', async () => {
    const [a, b] = await Promise.all([createUser('re-a'), createUser('re-b')]);
    const s1 = await createSoulSession(a, b);
    await service.rate(auth(a.id), s1.id, { verdict: SoulMatchVerdict.Like });
    await service.rate(auth(b.id), s1.id, { verdict: SoulMatchVerdict.Like });
    const before = await friendshipCount();

    const s2 = await createSoulSession(a, b);
    const r = await service.rate(auth(a.id), s2.id, {
      verdict: SoulMatchVerdict.Like,
    });
    expect(r.matched).toBe(true); // đã là bạn từ trước
    await service.rate(auth(b.id), s2.id, { verdict: SoulMatchVerdict.Like });
    expect(await friendshipCount()).toBe(before);
  });

  it('message: idempotency replay trả đúng message cũ; cùng key khác nội dung → 409; cursor seq phân trang đúng', async () => {
    const [a, b] = await Promise.all([
      createUser('msg-a'),
      createUser('msg-b'),
    ]);
    const session = await createSoulSession(a, b);

    const m1 = await service.sendMessage(
      auth(a.id),
      session.id,
      { content: 'xin chào' },
      'k1',
    );
    const replay = await service.sendMessage(
      auth(a.id),
      session.id,
      { content: 'xin chào' },
      'k1',
    );
    expect(replay.id).toBe(m1.id);
    await expect(
      service.sendMessage(auth(a.id), session.id, { content: 'khác' }, 'k1'),
    ).rejects.toMatchObject({
      code: SoulMatchErrors.MESSAGE_IDEMPOTENCY_CONFLICT,
    });

    await service.sendMessage(
      auth(b.id),
      session.id,
      { content: 'chào A' },
      'k2',
    );
    await service.sendMessage(
      auth(a.id),
      session.id,
      { content: 'khoẻ không' },
      'k3',
    );

    const page1 = await service.listMessages(auth(a.id), session.id, 2);
    expect(page1.items.map((m) => m.content)).toEqual(['xin chào', 'chào A']);
    expect(page1.meta.nextCursor).not.toBeNull();
    const page2 = await service.listMessages(
      auth(a.id),
      session.id,
      2,
      page1.meta.nextCursor as string,
    );
    expect(page2.items.map((m) => m.content)).toEqual(['khoẻ không']);
    expect(page2.meta.nextCursor).toBeNull();
  });

  it('cửa sổ enforce ở server: phase rating chặn gửi nhưng cho rate; phase closed chặn cả hai + chặn đọc', async () => {
    const [a, b] = await Promise.all([
      createUser('win-a'),
      createUser('win-b'),
    ]);
    // 200s > 150s (hết chat) nhưng < 270s (còn rating)
    const ratingPhase = await createSoulSession(a, b, 200);
    await expect(
      service.sendMessage(
        auth(a.id),
        ratingPhase.id,
        { content: 'trễ' },
        'kw1',
      ),
    ).rejects.toMatchObject({ code: SoulMatchErrors.CHAT_NOT_OPEN });
    const rated = await service.rate(auth(a.id), ratingPhase.id, {
      verdict: SoulMatchVerdict.Like,
    });
    expect(rated.verdict).toBe(SoulMatchVerdict.Like);

    // 400s > 270s — phòng đóng hẳn
    const closed = await createSoulSession(a, b, 400);
    await expect(
      service.rate(auth(a.id), closed.id, { verdict: SoulMatchVerdict.Like }),
    ).rejects.toMatchObject({ code: SoulMatchErrors.RATING_NOT_OPEN });
    await expect(
      service.listMessages(auth(a.id), closed.id, 20),
    ).rejects.toMatchObject({ code: SoulMatchErrors.CHAT_NOT_OPEN });
  });

  it('IDOR: user ngoài session nhận CÙNG 404 như session không tồn tại', async () => {
    const [a, b, outsider] = await Promise.all([
      createUser('idor-a'),
      createUser('idor-b'),
      createUser('idor-x'),
    ]);
    const session = await createSoulSession(a, b);
    await expect(
      service.getSessionView(auth(outsider.id), session.id),
    ).rejects.toMatchObject({ code: SoulMatchErrors.SESSION_NOT_FOUND });
    await expect(
      service.getSessionView(
        auth(outsider.id),
        '00000000-0000-4000-8000-000000000000',
      ),
    ).rejects.toMatchObject({ code: SoulMatchErrors.SESSION_NOT_FOUND });
  });

  it('session voice / chưa confirmed → không có phòng chat', async () => {
    const [a, b] = await Promise.all([createUser('nv-a'), createUser('nv-b')]);
    const voice = await createSoulSession(a, b, 0, MatchType.Voice);
    await expect(
      service.getSessionView(auth(a.id), voice.id),
    ).rejects.toMatchObject({ code: SoulMatchErrors.CHAT_NOT_OPEN });

    const pending = await createSoulSession(
      a,
      b,
      0,
      MatchType.Soul,
      MatchSessionStatus.PendingConfirm,
    );
    await expect(
      service.rate(auth(a.id), pending.id, { verdict: SoulMatchVerdict.Like }),
    ).rejects.toMatchObject({ code: SoulMatchErrors.CHAT_NOT_OPEN });
  });

  it('chốt chặn DB: friendship không canonical bị CHECK từ chối; insert trùng cặp bị unique chặn', async () => {
    const [a, b] = await Promise.all([createUser('db-a'), createUser('db-b')]);
    const [low, high] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];

    await expect(
      ds.query(
        `INSERT INTO friendships (user_low_id, user_high_id, source) VALUES ($1, $2, 'soul_match')`,
        [high, low], // sai thứ tự canonical
      ),
    ).rejects.toThrow(/chk_friendships_canonical/);

    await ds.query(
      `INSERT INTO friendships (user_low_id, user_high_id, source) VALUES ($1, $2, 'soul_match')`,
      [low, high],
    );
    await expect(
      ds.query(
        `INSERT INTO friendships (user_low_id, user_high_id, source) VALUES ($1, $2, 'soul_match')`,
        [low, high],
      ),
    ).rejects.toThrow(/uq_friendships_pair/);
    // còn ensureFriendship thì idempotent — không throw
    const result = await friendService.ensureFriendship(
      ds.manager,
      a.id,
      b.id,
      FriendshipSource.SoulMatch,
    );
    expect(result.created).toBe(false);
  });
});
