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
      { create: async () => ({ id: 'notification-stub' }) } as never,
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
});
