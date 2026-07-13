import { DataSource } from 'typeorm';

import { SnakeNamingStrategy } from '../../database/snake-naming.strategy';
import { InitAuthUser1751900000000 } from '../../database/migrations/1751900000000-init-auth-user';
import { UserRole1753600000000 } from '../../database/migrations/1753600000000-user-role';
import { MatchingCore1752200000000 } from '../../database/migrations/1752200000000-matching-core';
import { MatchingGenderPreference1752300000000 } from '../../database/migrations/1752300000000-matching-gender-preference';
import { SoulMatch1752400000000 } from '../../database/migrations/1752400000000-soul-match';
import { FriendChat1752600000000 } from '../../database/migrations/1752600000000-friend-chat';
import { Safety1752800000000 } from '../../database/migrations/1752800000000-safety';

import { FriendService } from './friend.service';
import { FriendErrors } from './friend.errors';
import { Conversation } from './entities/conversation.entity';
import { Friendship, FriendshipSource } from './entities/friendship.entity';
import { Message } from './entities/message.entity';
import { ConversationService } from './services/conversation.service';
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
 * Integration test Friend Chat trên Postgres thật (docs/05 § 5.9): bất biến
 * "Friendship ⟺ Conversation" kể cả dưới race (docs/services/friend-service.md § 1),
 * idempotency message, cursor pagination, membership/IDOR. DB riêng `<tên gốc>_friend`.
 */
const INTEGRATION_DB_URL = process.env['INTEGRATION_DB_URL'];
const d = INTEGRATION_DB_URL ? describe : describe.skip;
if (!INTEGRATION_DB_URL) {
  console.warn(
    '[friend.integration] BỎ QUA — set INTEGRATION_DB_URL để chạy bộ test trên Postgres thật',
  );
}

jest.setTimeout(60_000);

const CONFIG: Record<string, unknown> = {
  FRIEND_MESSAGE_MAX_LENGTH: 20,
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

d('Friend integration (Postgres thật)', () => {
  let ds: DataSource;
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

  async function ensureFriendship(a: User, b: User): Promise<void> {
    await ds.transaction((manager) =>
      friend.ensureFriendship(manager, a.id, b.id, FriendshipSource.SoulMatch),
    );
  }

  beforeAll(async () => {
    const url = new URL(INTEGRATION_DB_URL as string);
    const dbName = `${url.pathname.slice(1)}_friend`;
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
      ],
      migrations: [
        InitAuthUser1751900000000,
        UserRole1753600000000,
        MatchingCore1752200000000,
        MatchingGenderPreference1752300000000,
        SoulMatch1752400000000,
        FriendChat1752600000000,
        Safety1752800000000,
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
    // Stub tối thiểu — chỉ cần không throw để SafetyService.block() validate target tồn tại;
    // các method khác của UserService không liên quan tới guard block ở suite này.
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
      conversationService,
      safety,
      // Notification không phải trọng tâm suite này (test riêng ở notification.service.spec.ts) — stub no-op
      {
        create: async () => ({ id: 'notif-stub' }),
        sendPush: async () => undefined,
      } as never,
      configStub,
      // stub publish — realtime end-to-end đã test ở suite signaling-gateway
      { publish: async () => 1 } as never,
    );
  });

  afterAll(async () => {
    await ds?.destroy();
  });

  it('ensureFriendship tạo ĐÚNG 1 Friendship + ĐÚNG 1 Conversation cho 1 cặp (bất biến spec § 1)', async () => {
    const [a, b] = await Promise.all([
      createUser('inv-a'),
      createUser('inv-b'),
    ]);
    await ensureFriendship(a, b);

    const friendshipCount = await ds.getRepository(Friendship).countBy({
      userLowId: a.id < b.id ? a.id : b.id,
      userHighId: a.id < b.id ? b.id : a.id,
    });
    const conversationCount = await ds.getRepository(Conversation).countBy({
      userLowId: a.id < b.id ? a.id : b.id,
      userHighId: a.id < b.id ? b.id : a.id,
    });
    expect(friendshipCount).toBe(1);
    expect(conversationCount).toBe(1);
    expect(await friend.areFriends(a.id, b.id)).toBe(true);
  });

  it('RACE: 2 lời gọi ensureFriendship song song cho CÙNG cặp → vẫn đúng 1 Friendship + 1 Conversation', async () => {
    const [a, b] = await Promise.all([
      createUser('race-a'),
      createUser('race-b'),
    ]);

    await Promise.all([ensureFriendship(a, b), ensureFriendship(a, b)]);

    const [low, high] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
    expect(
      await ds
        .getRepository(Friendship)
        .countBy({ userLowId: low, userHighId: high }),
    ).toBe(1);
    expect(
      await ds
        .getRepository(Conversation)
        .countBy({ userLowId: low, userHighId: high }),
    ).toBe(1);
  });

  it('match lại cặp đã là bạn (ensureFriendship gọi lần 2) không vỡ — vẫn 1 dòng mỗi bảng', async () => {
    const [a, b] = await Promise.all([createUser('re-a'), createUser('re-b')]);
    await ensureFriendship(a, b);
    await ensureFriendship(a, b); // "match lại lần 2"

    const [low, high] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
    expect(
      await ds
        .getRepository(Friendship)
        .countBy({ userLowId: low, userHighId: high }),
    ).toBe(1);
    expect(
      await ds
        .getRepository(Conversation)
        .countBy({ userLowId: low, userHighId: high }),
    ).toBe(1);
  });

  it('getConversationWithFriend: đúng bạn → trả conversation; không phải bạn/tự mình → 404 NOT_FRIEND', async () => {
    const [a, b, outsider] = await Promise.all([
      createUser('gc-a'),
      createUser('gc-b'),
      createUser('gc-out'),
    ]);
    await ensureFriendship(a, b);

    const conv = await friend.getConversationWithFriend(a.id, b.id);
    expect(conv.id).toEqual(expect.any(String));

    await expect(
      friend.getConversationWithFriend(a.id, outsider.id),
    ).rejects.toMatchObject({ code: FriendErrors.NOT_FRIEND });
    await expect(
      friend.getConversationWithFriend(a.id, a.id),
    ).rejects.toMatchObject({ code: FriendErrors.NOT_FRIEND });
  });

  it('message: idempotency replay trả đúng message cũ; cùng key khác nội dung → 409; cursor phân trang đúng', async () => {
    const [a, b] = await Promise.all([
      createUser('msg-a'),
      createUser('msg-b'),
    ]);
    await ensureFriendship(a, b);
    const conv = await friend.getConversationWithFriend(a.id, b.id);

    const m1 = await friend.sendMessage(a.id, conv.id, 'xin chao', 'k1');
    const replay = await friend.sendMessage(a.id, conv.id, 'xin chao', 'k1');
    expect(replay.id).toBe(m1.id);
    await expect(
      friend.sendMessage(a.id, conv.id, 'khac', 'k1'),
    ).rejects.toMatchObject({
      code: FriendErrors.MESSAGE_IDEMPOTENCY_CONFLICT,
    });

    await friend.sendMessage(b.id, conv.id, 'chao a', 'k2');
    await friend.sendMessage(a.id, conv.id, 'khoe khong', 'k3');

    const page1 = await friend.listMessages(a.id, conv.id, 2);
    expect(page1.items.map((m) => m.content)).toEqual(['xin chao', 'chao a']);
    expect(page1.meta.nextCursor).not.toBeNull();
    const page2 = await friend.listMessages(
      a.id,
      conv.id,
      2,
      page1.meta.nextCursor as string,
    );
    expect(page2.items.map((m) => m.content)).toEqual(['khoe khong']);
    expect(page2.meta.nextCursor).toBeNull();
  });

  it('message quá FRIEND_MESSAGE_MAX_LENGTH → 422 MESSAGE_TOO_LONG', async () => {
    const [a, b] = await Promise.all([
      createUser('long-a'),
      createUser('long-b'),
    ]);
    await ensureFriendship(a, b);
    const conv = await friend.getConversationWithFriend(a.id, b.id);
    await expect(
      friend.sendMessage(a.id, conv.id, 'x'.repeat(21), 'k1'),
    ).rejects.toMatchObject({ code: FriendErrors.MESSAGE_TOO_LONG });
  });

  it('IDOR: người ngoài conversation nhận CÙNG 404 khi list/gửi message; conversationId lạ cũng vậy', async () => {
    const [a, b, outsider] = await Promise.all([
      createUser('idor-a'),
      createUser('idor-b'),
      createUser('idor-out'),
    ]);
    await ensureFriendship(a, b);
    const conv = await friend.getConversationWithFriend(a.id, b.id);

    await expect(
      friend.listMessages(outsider.id, conv.id, 20),
    ).rejects.toMatchObject({ code: FriendErrors.CONVERSATION_NOT_FOUND });
    await expect(
      friend.sendMessage(outsider.id, conv.id, 'hi', 'k1'),
    ).rejects.toMatchObject({ code: FriendErrors.CONVERSATION_NOT_FOUND });
    await expect(
      friend.listMessages(a.id, '00000000-0000-4000-8000-000000000000', 20),
    ).rejects.toMatchObject({ code: FriendErrors.CONVERSATION_NOT_FOUND });
  });

  it('block 2 chiều chặn gửi message — CÙNG mã lỗi với "không phải thành viên" (docs/services/safety-service.md § 6)', async () => {
    const [a, b] = await Promise.all([
      createUser('blk-a'),
      createUser('blk-b'),
    ]);
    await ensureFriendship(a, b);
    const conv = await friend.getConversationWithFriend(a.id, b.id);

    await safety.block(b.id, a.id); // b chặn a
    await expect(
      friend.sendMessage(a.id, conv.id, 'hi', 'k1'),
    ).rejects.toMatchObject({ code: FriendErrors.CONVERSATION_NOT_FOUND });
    // Chiều còn lại (a gửi cho b khi CHÍNH a là người bị block) cũng chặn — check 2 chiều
    await expect(
      friend.sendMessage(b.id, conv.id, 'hi', 'k1'),
    ).rejects.toMatchObject({ code: FriendErrors.CONVERSATION_NOT_FOUND });

    await safety.unblock(b.id, a.id);
    const msg = await friend.sendMessage(a.id, conv.id, 'hi lại', 'k2');
    expect(msg.content).toBe('hi lại');
  });

  it('listFriends: sort theo lastMessageAt gần nhất, bạn chưa chat lần nào sort theo friendSince', async () => {
    const [me, oldFriend, chattyFriend] = await Promise.all([
      createUser('lf-me'),
      createUser('lf-old'),
      createUser('lf-chatty'),
    ]);
    await ensureFriendship(me, oldFriend);
    await ensureFriendship(me, chattyFriend);
    const convWithChatty = await friend.getConversationWithFriend(
      me.id,
      chattyFriend.id,
    );
    await friend.sendMessage(me.id, convWithChatty.id, 'hi', 'k1');

    const list = await friend.listFriends(me.id);
    expect(list[0]?.partnerId).toBe(chattyFriend.id); // có tin nhắn → lên đầu
    expect(list.map((e) => e.partnerId)).toContain(oldFriend.id);
    expect(
      list.find((e) => e.partnerId === oldFriend.id)?.lastMessageAt,
    ).toBeNull();
  });
});
