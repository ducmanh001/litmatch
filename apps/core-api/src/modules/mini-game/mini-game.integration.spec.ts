import { DataSource } from 'typeorm';

import { SnakeNamingStrategy } from '../../database/snake-naming.strategy';
import { InitAuthUser1751900000000 } from '../../database/migrations/1751900000000-init-auth-user';
import { MatchingCore1752200000000 } from '../../database/migrations/1752200000000-matching-core';
import { MatchingGenderPreference1752300000000 } from '../../database/migrations/1752300000000-matching-gender-preference';
import { SoulMatch1752400000000 } from '../../database/migrations/1752400000000-soul-match';
import { FriendChat1752600000000 } from '../../database/migrations/1752600000000-friend-chat';
import { Safety1752800000000 } from '../../database/migrations/1752800000000-safety';
import { MiniGame1753400000000 } from '../../database/migrations/1753400000000-mini-game';

import { MiniGameErrors } from './mini-game.errors';
import { MiniGameService } from './mini-game.service';
import { MiniGameActiveParticipant } from './entities/mini-game-active-participant.entity';
import {
  MiniGameSession,
  MiniGameSessionStatus,
} from './entities/mini-game-session.entity';
import { MiniGameType, RockPaperScissorsMove } from './mini-game.constants';
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
 * Integration test Mini Game trên Postgres thật (docs/05 § 5.9): race/concurrency của
 * `mini_game_active_participants` (2 request tạo ván đồng thời cùng cặp → chỉ 1 row, không
 * 500; 2 request nộp move đồng thời từ CÙNG user → chỉ 1 thành công) + luồng
 * tạo → nộp move → resolve/cancel. DB riêng `<tên gốc>_mini_game`.
 */
const INTEGRATION_DB_URL = process.env['INTEGRATION_DB_URL'];
const d = INTEGRATION_DB_URL ? describe : describe.skip;
if (!INTEGRATION_DB_URL) {
  console.warn(
    '[mini-game.integration] BỎ QUA — set INTEGRATION_DB_URL để chạy bộ test trên Postgres thật',
  );
}

jest.setTimeout(60_000);

const CONFIG: Record<string, unknown> = {
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

d('Mini Game integration (Postgres thật)', () => {
  let ds: DataSource;
  let miniGame: MiniGameService;
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
    const dbName = `${url.pathname.slice(1)}_mini_game`;
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
        MiniGameSession,
        MiniGameActiveParticipant,
      ],
      migrations: [
        InitAuthUser1751900000000,
        MatchingCore1752200000000,
        MatchingGenderPreference1752300000000,
        SoulMatch1752400000000,
        FriendChat1752600000000,
        Safety1752800000000,
        MiniGame1753400000000,
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
      safety,
      {
        create: async () => ({ id: 'notif-stub' }),
        sendPush: async () => undefined,
      } as never,
      configStub,
      { publish: async () => 1 } as never,
    );
    miniGame = new MiniGameService(
      ds,
      ds.getRepository(MiniGameSession),
      friend,
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
      miniGame.createSession(a.id, b.id, MiniGameType.RockPaperScissors),
    ).rejects.toMatchObject({ code: MiniGameErrors.NOT_FRIEND });
    expect(await ds.getRepository(MiniGameSession).count()).toBe(0);
  });

  it('tạo ván mới cho 2 bạn, gọi lại cùng cặp → idempotent trả ĐÚNG ván cũ', async () => {
    const [a, b] = await Promise.all([createUser('cr-a'), createUser('cr-b')]);
    await makeFriends(a, b);

    const first = await miniGame.createSession(
      a.id,
      b.id,
      MiniGameType.RockPaperScissors,
    );
    const second = await miniGame.createSession(
      b.id,
      a.id,
      MiniGameType.RockPaperScissors,
    );
    expect(second.id).toBe(first.id);

    const count = await ds
      .getRepository(MiniGameSession)
      .countBy({ status: MiniGameSessionStatus.WaitingMoves });
    expect(count).toBe(1);
  });

  it('RACE: 2 request tạo ván song song CÙNG cặp → đúng 1 row waiting_moves, không lỗi 500', async () => {
    const [a, b] = await Promise.all([
      createUser('race-create-a'),
      createUser('race-create-b'),
    ]);
    await makeFriends(a, b);

    const results = await Promise.allSettled([
      miniGame.createSession(a.id, b.id, MiniGameType.RockPaperScissors),
      miniGame.createSession(a.id, b.id, MiniGameType.RockPaperScissors),
    ]);
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
    const ids = results.map(
      (r) => (r as PromiseFulfilledResult<MiniGameSession>).value.id,
    );
    expect(ids[0]).toBe(ids[1]);

    const [low, high] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
    const count = await ds.getRepository(MiniGameSession).countBy({
      userLowId: low,
      userHighId: high,
      status: MiniGameSessionStatus.WaitingMoves,
    });
    expect(count).toBe(1);
  });

  it('đang chờ move với 1 bạn → tạo với BẠN KHÁC → 409 ALREADY_WAITING, không tự huỷ ván cũ', async () => {
    const [a, b, c] = await Promise.all([
      createUser('conf-a'),
      createUser('conf-b'),
      createUser('conf-c'),
    ]);
    await Promise.all([makeFriends(a, b), makeFriends(a, c)]);

    const withB = await miniGame.createSession(
      a.id,
      b.id,
      MiniGameType.RockPaperScissors,
    );
    await expect(
      miniGame.createSession(a.id, c.id, MiniGameType.RockPaperScissors),
    ).rejects.toMatchObject({ code: MiniGameErrors.ALREADY_WAITING });

    const stillWaiting = await miniGame.getSession(a.id, withB.id);
    expect(stillWaiting.status).toBe(MiniGameSessionStatus.WaitingMoves);
  });

  it('GET trước khi cả 2 nộp → KHÔNG lộ move đối phương (opponentMove không tồn tại trên entity thô, chỉ opponentHasMoved ở DTO); nộp move lần 2 → 409, không đổi được move', async () => {
    const [a, b] = await Promise.all([
      createUser('flow-a'),
      createUser('flow-b'),
    ]);
    await makeFriends(a, b);

    const session = await miniGame.createSession(
      a.id,
      b.id,
      MiniGameType.RockPaperScissors,
    );
    expect(session.status).toBe(MiniGameSessionStatus.WaitingMoves);
    // Cặp canonical low/high theo so sánh chuỗi uuid — không nhất thiết trùng thứ tự (a, b) tạo
    // ván (spec dùng canonicalPair, docs/services/mini-game-service.md § 2). Dùng myMove(...)
    // để đọc move của MỘT participant bất kể họ ở cột nào.
    const myMove = (s: MiniGameSession, userId: string) =>
      s.userLowId === userId ? s.lowMove : s.highMove;
    const opponentMove = (s: MiniGameSession, userId: string) =>
      s.userLowId === userId ? s.highMove : s.lowMove;

    const afterFirstMove = await miniGame.submitMove(
      a.id,
      session.id,
      RockPaperScissorsMove.Rock,
    );
    expect(afterFirstMove.status).toBe(MiniGameSessionStatus.WaitingMoves);
    expect(myMove(afterFirstMove, a.id)).toBe(RockPaperScissorsMove.Rock);
    expect(opponentMove(afterFirstMove, a.id)).toBeNull();

    // Nộp lại lần 2 (cùng user) → 409, KHÔNG đổi được move đã nộp
    await expect(
      miniGame.submitMove(a.id, session.id, RockPaperScissorsMove.Paper),
    ).rejects.toMatchObject({ code: MiniGameErrors.MOVE_ALREADY_SUBMITTED });
    const stillRock = await miniGame.getSession(a.id, session.id);
    expect(myMove(stillRock, a.id)).toBe(RockPaperScissorsMove.Rock);

    // Bên kia nộp → đủ cả 2 → resolve
    const resolved = await miniGame.submitMove(
      b.id,
      session.id,
      RockPaperScissorsMove.Scissors,
    );
    expect(resolved.status).toBe(MiniGameSessionStatus.Resolved);
    expect(resolved.winnerUserId).toBe(a.id); // rock thắng scissors
    expect(resolved.resolvedAt).not.toBeNull();

    // Participant rows đã được xoá — cả 2 có thể tạo ván mới ngay (kể cả với người khác)
    const participantCount = await ds
      .getRepository(MiniGameActiveParticipant)
      .countBy({ sessionId: session.id });
    expect(participantCount).toBe(0);

    // Nộp move trên ván đã resolved → 409
    await expect(
      miniGame.submitMove(a.id, session.id, RockPaperScissorsMove.Rock),
    ).rejects.toMatchObject({ code: MiniGameErrors.MOVE_ALREADY_SUBMITTED });
  });

  it('RACE: 2 request nộp move CÙNG lúc từ CÙNG user → chỉ 1 thành công, không double-resolve', async () => {
    const [a, b] = await Promise.all([
      createUser('race-move-a'),
      createUser('race-move-b'),
    ]);
    await makeFriends(a, b);
    const session = await miniGame.createSession(
      a.id,
      b.id,
      MiniGameType.RockPaperScissors,
    );

    const results = await Promise.allSettled([
      miniGame.submitMove(a.id, session.id, RockPaperScissorsMove.Rock),
      miniGame.submitMove(a.id, session.id, RockPaperScissorsMove.Paper),
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
      code: MiniGameErrors.MOVE_ALREADY_SUBMITTED,
    });

    const fresh = await ds
      .getRepository(MiniGameSession)
      .findOneByOrFail({ id: session.id });
    // Đúng 1 trong 2 move được ghi (ở đúng cột của `a`, bất kể `a` là low hay high theo
    // canonicalPair), không bị ghi đè lẫn nhau.
    const aMove = fresh.userLowId === a.id ? fresh.lowMove : fresh.highMove;
    const otherColumn =
      fresh.userLowId === a.id ? fresh.highMove : fresh.lowMove;
    expect([RockPaperScissorsMove.Rock, RockPaperScissorsMove.Paper]).toContain(
      aMove,
    );
    expect(otherColumn).toBeNull();
    expect(fresh.status).toBe(MiniGameSessionStatus.WaitingMoves);
  });

  it('luật thắng thua đủ 9 tổ hợp rock/paper/scissors', async () => {
    const moves = [
      RockPaperScissorsMove.Rock,
      RockPaperScissorsMove.Paper,
      RockPaperScissorsMove.Scissors,
    ];
    let i = 0;
    for (const lowMove of moves) {
      for (const highMove of moves) {
        i += 1;
        const [a, b] = await Promise.all([
          createUser(`rule-a-${i}`),
          createUser(`rule-b-${i}`),
        ]);
        await makeFriends(a, b);
        const [low, high] = a.id < b.id ? [a, b] : [b, a];

        const session = await miniGame.createSession(
          low.id,
          high.id,
          MiniGameType.RockPaperScissors,
        );
        await miniGame.submitMove(low.id, session.id, lowMove);
        const resolved = await miniGame.submitMove(
          high.id,
          session.id,
          highMove,
        );

        expect(resolved.status).toBe(MiniGameSessionStatus.Resolved);
        if (lowMove === highMove) {
          expect(resolved.winnerUserId).toBeNull();
        } else {
          const lowWins =
            (lowMove === RockPaperScissorsMove.Rock &&
              highMove === RockPaperScissorsMove.Scissors) ||
            (lowMove === RockPaperScissorsMove.Scissors &&
              highMove === RockPaperScissorsMove.Paper) ||
            (lowMove === RockPaperScissorsMove.Paper &&
              highMove === RockPaperScissorsMove.Rock);
          expect(resolved.winnerUserId).toBe(lowWins ? low.id : high.id);
        }
      }
    }
  });

  it('cancel ván đang chờ move; IDOR not-found cho người ngoài', async () => {
    const [a, b, outsider] = await Promise.all([
      createUser('cancel-a'),
      createUser('cancel-b'),
      createUser('cancel-out'),
    ]);
    await makeFriends(a, b);

    const session = await miniGame.createSession(
      a.id,
      b.id,
      MiniGameType.RockPaperScissors,
    );

    // IDOR: người ngoài không phải participant → 404
    await expect(
      miniGame.getSession(outsider.id, session.id),
    ).rejects.toMatchObject({ code: MiniGameErrors.NOT_FOUND });
    await expect(
      miniGame.submitMove(outsider.id, session.id, RockPaperScissorsMove.Rock),
    ).rejects.toMatchObject({ code: MiniGameErrors.NOT_FOUND });
    await expect(
      miniGame.cancelSession(outsider.id, session.id),
    ).rejects.toMatchObject({ code: MiniGameErrors.NOT_FOUND });

    const cancelled = await miniGame.cancelSession(b.id, session.id);
    expect(cancelled.status).toBe(MiniGameSessionStatus.Cancelled);

    const participantCount = await ds
      .getRepository(MiniGameActiveParticipant)
      .countBy({ sessionId: session.id });
    expect(participantCount).toBe(0);

    // Nộp move trên ván đã cancelled → 409
    await expect(
      miniGame.submitMove(a.id, session.id, RockPaperScissorsMove.Rock),
    ).rejects.toMatchObject({ code: MiniGameErrors.MOVE_ALREADY_SUBMITTED });

    // Sau khi cancelled, có thể tạo lại ván MỚI cho cùng cặp (unique index chỉ áp cho waiting_moves)
    const restarted = await miniGame.createSession(
      a.id,
      b.id,
      MiniGameType.RockPaperScissors,
    );
    expect(restarted.id).not.toBe(session.id);
    expect(restarted.status).toBe(MiniGameSessionStatus.WaitingMoves);
  });
});
