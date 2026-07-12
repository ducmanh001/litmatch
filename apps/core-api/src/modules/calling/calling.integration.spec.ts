import { DataSource } from 'typeorm';

import { SnakeNamingStrategy } from '../../database/snake-naming.strategy';
import { InitAuthUser1751900000000 } from '../../database/migrations/1751900000000-init-auth-user';
import { EconomyLedger1752000000000 } from '../../database/migrations/1752000000000-economy-ledger';
import { EconomyRefund1752100000000 } from '../../database/migrations/1752100000000-economy-refund';
import { MatchingCore1752200000000 } from '../../database/migrations/1752200000000-matching-core';
import { MatchingGenderPreference1752300000000 } from '../../database/migrations/1752300000000-matching-gender-preference';
import { SoulMatch1752400000000 } from '../../database/migrations/1752400000000-soul-match';
import { Calling1752500000000 } from '../../database/migrations/1752500000000-calling';

import { CallingService } from './calling.service';
import { CallTickerService } from './jobs/call-ticker.service';
import {
  CallEndReason,
  CallSession,
  CallSessionStatus,
} from './entities/call-session.entity';
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
import { EconomyService } from '../economy/economy.service';
import { LedgerService } from '../economy/services/ledger.service';
import { LedgerAccount } from '../economy/entities/ledger-account.entity';
import { LedgerEntry } from '../economy/entities/ledger-entry.entity';
import { OutboxEvent } from '../economy/entities/outbox-event.entity';
import { LedgerTransaction } from '../economy/entities/transaction.entity';
import { Wallet } from '../economy/entities/wallet.entity';
import {
  IapProduct,
  IapProvider,
  IapReceipt,
} from '../economy/entities/iap.entities';
import { VipPlan } from '../economy/entities/vip-plan.entity';
import { Gender, User, UserService } from '../user';

import type { ConfigService } from '@nestjs/config';
import type { SchedulerRegistry } from '@nestjs/schedule';

import type { CoreApiEnv } from '../../config/env.validation';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import type { IapVerifier } from '../economy/ports/iap-verifier';
import type { LivekitRoomPort } from './ports/livekit-room';

/**
 * Integration test Calling trên Postgres thật (docs/05 § 5.9 + tiêu chí Economy docs/10):
 * billing tick idempotent (2 ticker song song không trừ đôi), race end-vs-tick,
 * insufficient balance → end, free-limit không đụng tiền. DB riêng `<tên gốc>_calling`.
 */
const INTEGRATION_DB_URL = process.env['INTEGRATION_DB_URL'];
const d = INTEGRATION_DB_URL ? describe : describe.skip;
if (!INTEGRATION_DB_URL) {
  // eslint-disable-next-line no-console
  console.warn(
    '[calling.integration] BỎ QUA — set INTEGRATION_DB_URL để chạy bộ test billing trên Postgres thật',
  );
}

jest.setTimeout(60_000);

const CONFIG: Record<string, unknown> = {
  LIVEKIT_URL: 'ws://localhost:7880',
  CALLING_TOKEN_TTL_SECONDS: 120,
  // free window nhỏ + pending timeout lớn: test tự backdate thay vì ngồi chờ
  CALLING_FREE_CALL_SECONDS: 5,
  CALLING_PRICE_PER_MINUTE_DIAMOND: 0,
  CALLING_PENDING_TIMEOUT_SECONDS: 3600,
  CALLING_TICKER_INTERVAL_MS: 1000,
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
const schedulerStub = {
  addInterval: () => undefined,
  doesExist: () => false,
  deleteInterval: () => undefined,
} as unknown as SchedulerRegistry;

d('Calling integration (Postgres thật)', () => {
  let ds: DataSource;
  let economy: EconomyService;
  let calling: CallingService;
  let ticker: CallTickerService;
  let tickerB: CallTickerService; // instance thứ 2 — giả lập 2 pod ticker song song
  const deletedRooms: string[] = [];
  const livekitStub: LivekitRoomPort = {
    mintJoinToken: async (room, identity) => `tok:${room}:${identity}`,
    deleteRoom: async (room) => {
      deletedRooms.push(room);
    },
    receiveWebhook: async () => {
      throw new Error(
        'không dùng trong suite này — verify chữ ký thuộc port SDK',
      );
    },
  };

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

  async function fund(userId: string): Promise<void> {
    await economy.creditFromIap(
      userId,
      IapProvider.Google,
      { devTransactionId: `fund-${userId}-${++seedCounter}` },
      'com.litmatch.diamond.1200',
    );
  }

  async function balanceOf(userId: string): Promise<number> {
    const wallet = await ds.getRepository(Wallet).findOneBy({ userId });
    return Number(wallet?.balance ?? 0);
  }

  async function createVoiceSession(
    userA: User,
    userB: User,
  ): Promise<MatchSession> {
    seedCounter += 1;
    const ticketRepo = ds.getRepository(MatchTicket);
    const make = (u: User, tag: string): MatchTicket =>
      ticketRepo.create({
        userId: u.id,
        matchType: MatchType.Voice,
        region: 'VN',
        ageBand: 5,
        status: MatchTicketStatus.Confirmed,
        enqueuedAt: new Date(),
        priorityBoostMs: 0,
        sessionId: null,
        idempotencyKey: `call-it:${seedCounter}:${tag}:${u.id}`,
      });
    const ta = await ticketRepo.save(make(userA, 'a'));
    const tb = await ticketRepo.save(make(userB, 'b'));
    const sessionRepo = ds.getRepository(MatchSession);
    return sessionRepo.save(
      sessionRepo.create({
        matchType: MatchType.Voice,
        userAId: userA.id,
        userBId: userB.id,
        ticketAId: ta.id,
        ticketBId: tb.id,
        status: MatchSessionStatus.Confirmed,
        confirmedAAt: new Date(),
        confirmedBAt: new Date(),
        endedAt: null,
      }),
    );
  }

  /** Join cả 2 + webhook joined cả 2 → call active; backdate startedAt về quá khứ. */
  async function activeCall(
    userA: User,
    userB: User,
    startedSecondsAgo: number,
  ): Promise<CallSession> {
    const session = await createVoiceSession(userA, userB);
    const { call } = await calling.joinCall(auth(userA.id), session.id);
    for (const uid of [userA.id, userB.id]) {
      await calling.handleWebhookEvent({
        event: 'participant_joined',
        roomName: call.roomName,
        participantIdentity: uid,
      });
    }
    await ds
      .getRepository(CallSession)
      .update(
        { id: call.id },
        { startedAt: new Date(Date.now() - startedSecondsAgo * 1000) },
      );
    return ds.getRepository(CallSession).findOneByOrFail({ id: call.id });
  }

  beforeAll(async () => {
    const url = new URL(INTEGRATION_DB_URL as string);
    const dbName = `${url.pathname.slice(1)}_calling`;
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
        CallSession,
        LedgerAccount,
        LedgerTransaction,
        LedgerEntry,
        Wallet,
        IapProduct,
        IapReceipt,
        VipPlan,
        OutboxEvent,
      ],
      migrations: [
        InitAuthUser1751900000000,
        EconomyLedger1752000000000,
        EconomyRefund1752100000000,
        MatchingCore1752200000000,
        MatchingGenderPreference1752300000000,
        SoulMatch1752400000000,
        Calling1752500000000,
      ],
      namingStrategy: new SnakeNamingStrategy(),
      synchronize: false,
      dropSchema: true,
    });
    await ds.initialize();
    await ds.runMigrations();

    const userService = new UserService(ds.getRepository(User), configStub);
    const ledger = new LedgerService(ds);
    const stubVerifier = {
      verify: async (_p: IapProvider, payload: Record<string, unknown>) => ({
        providerTransactionId: String(payload['devTransactionId']),
      }),
    } as IapVerifier;
    economy = new EconomyService(
      ds.getRepository(Wallet),
      ds.getRepository(IapProduct),
      ds.getRepository(VipPlan),
      ds.getRepository(LedgerTransaction),
      ledger,
      stubVerifier,
    );
    const matchingService = new MatchingService(
      ds,
      ds.getRepository(MatchTicket),
      userService,
      {} as never,
      configStub,
      {} as never,
    );
    calling = new CallingService(
      ds,
      ds.getRepository(CallSession),
      matchingService,
      livekitStub,
      configStub,
      // stub publish — realtime end-to-end đã test ở suite signaling-gateway
      { publish: async () => 1 } as never,
    );
    ticker = new CallTickerService(
      ds,
      configStub,
      schedulerStub,
      calling,
      economy,
    );
    tickerB = new CallTickerService(
      ds,
      configStub,
      schedulerStub,
      calling,
      economy,
    );
  });

  afterAll(async () => {
    await ds?.destroy();
  });

  beforeEach(() => {
    CONFIG['CALLING_PRICE_PER_MINUTE_DIAMOND'] = 0;
    deletedRooms.length = 0;
  });

  it('join 2 bên đồng thời → đúng 1 call (unique match_session_id); webhook joined đủ 2 → active', async () => {
    const [a, b] = await Promise.all([createUser('j-a'), createUser('j-b')]);
    const session = await createVoiceSession(a, b);

    const [ra, rb] = await Promise.all([
      calling.joinCall(auth(a.id), session.id),
      calling.joinCall(auth(b.id), session.id),
    ]);
    expect(ra.call.id).toBe(rb.call.id);
    expect(
      await ds
        .getRepository(CallSession)
        .countBy({ matchSessionId: session.id }),
    ).toBe(1);
    expect(ra.token).not.toBe(rb.token); // token per-identity

    for (const uid of [a.id, b.id]) {
      await calling.handleWebhookEvent({
        event: 'participant_joined',
        roomName: ra.call.roomName,
        participantIdentity: uid,
      });
    }
    // replay webhook — idempotent
    await calling.handleWebhookEvent({
      event: 'participant_joined',
      roomName: ra.call.roomName,
      participantIdentity: a.id,
    });
    const fresh = await ds
      .getRepository(CallSession)
      .findOneByOrFail({ id: ra.call.id });
    expect(fresh.status).toBe(CallSessionStatus.Active);
    expect(fresh.startedAt).not.toBeNull();
  });

  it('free-limit (price=0): hết free window server tự end, KHÔNG đụng tiền, room được dọn', async () => {
    const [a, b] = await Promise.all([createUser('f-a'), createUser('f-b')]);
    await fund(a.id);
    const before = await balanceOf(a.id);
    const call = await activeCall(a, b, 10); // 10s > free 5s

    await ticker.runOnce();

    const fresh = await ds
      .getRepository(CallSession)
      .findOneByOrFail({ id: call.id });
    expect(fresh.status).toBe(CallSessionStatus.Ended);
    expect(fresh.endReason).toBe(CallEndReason.FreeLimit);
    expect(fresh.durationSeconds).toBeGreaterThanOrEqual(10);
    expect(deletedRooms).toContain(call.roomName);
    expect(await balanceOf(a.id)).toBe(before); // không trừ đồng nào
  });

  it('billing: 2 ticker SONG SONG cùng phút → mỗi bên trừ đúng 1 lần; phút sau trừ tiếp', async () => {
    CONFIG['CALLING_PRICE_PER_MINUTE_DIAMOND'] = 5;
    const [a, b] = await Promise.all([createUser('b-a'), createUser('b-b')]);
    await Promise.all([fund(a.id), fund(b.id)]);
    // 5s free + đã qua 10s → đang ở phút tính phí thứ 1
    const call = await activeCall(a, b, 15);

    await Promise.all([ticker.runOnce(), tickerB.runOnce()]);
    expect(await balanceOf(a.id)).toBe(1200 - 5);
    expect(await balanceOf(b.id)).toBe(1200 - 5);
    let fresh = await ds
      .getRepository(CallSession)
      .findOneByOrFail({ id: call.id });
    expect(fresh.status).toBe(CallSessionStatus.Active); // đủ tiền — call tiếp tục
    expect(fresh.billedMinutes).toBe(1);

    // backdate thêm 60s → sang phút tính phí thứ 2
    const startedAt = fresh.startedAt as Date; // active thì luôn có startedAt
    await ds
      .getRepository(CallSession)
      .update(
        { id: call.id },
        { startedAt: new Date(startedAt.getTime() - 60_000) },
      );
    await ticker.runOnce();
    expect(await balanceOf(a.id)).toBe(1200 - 10);
    expect(await balanceOf(b.id)).toBe(1200 - 10);
    fresh = await ds
      .getRepository(CallSession)
      .findOneByOrFail({ id: call.id });
    expect(fresh.billedMinutes).toBe(2);
  });

  it('billing: 1 bên không đủ diamond → end insufficient_balance, phút đã trừ không hoàn', async () => {
    CONFIG['CALLING_PRICE_PER_MINUTE_DIAMOND'] = 5;
    const [rich, poor] = await Promise.all([
      createUser('i-rich'),
      createUser('i-poor'),
    ]);
    await fund(rich.id); // poor: 0 diamond
    const call = await activeCall(rich, poor, 15);

    await ticker.runOnce();

    const fresh = await ds
      .getRepository(CallSession)
      .findOneByOrFail({ id: call.id });
    expect(fresh.status).toBe(CallSessionStatus.Ended);
    expect(fresh.endReason).toBe(CallEndReason.InsufficientBalance);
    expect(fresh.billedMinutes).toBe(0); // phút 1 không hoàn tất
    // biên bất đối xứng đã chấp nhận (spec § 6): rich bị trừ phút 1 trước khi poor fail
    expect(await balanceOf(rich.id)).toBe(1200 - 5);
    expect(await balanceOf(poor.id)).toBe(0);

    // tick lặp sau khi ended — không trừ thêm (race end-vs-tick)
    await ticker.runOnce();
    expect(await balanceOf(rich.id)).toBe(1200 - 5);
  });

  it('race end-vs-tick: call end TRƯỚC tick → tick không trừ đồng nào', async () => {
    CONFIG['CALLING_PRICE_PER_MINUTE_DIAMOND'] = 5;
    const [a, b] = await Promise.all([createUser('r-a'), createUser('r-b')]);
    await Promise.all([fund(a.id), fund(b.id)]);
    const call = await activeCall(a, b, 15);

    await calling.endCall(auth(a.id), call.id);
    await Promise.all([ticker.runOnce(), tickerB.runOnce()]);

    expect(await balanceOf(a.id)).toBe(1200);
    expect(await balanceOf(b.id)).toBe(1200);
    const fresh = await ds
      .getRepository(CallSession)
      .findOneByOrFail({ id: call.id });
    expect(fresh.endReason).toBe(CallEndReason.Completed);
    expect(fresh.billedMinutes).toBe(0);
  });

  it('pending timeout: 1 bên không bao giờ join → ticker end pending_timeout + dọn room', async () => {
    const [a, b] = await Promise.all([createUser('p-a'), createUser('p-b')]);
    const session = await createVoiceSession(a, b);
    const { call } = await calling.joinCall(auth(a.id), session.id);
    // raw SQL: created_at là CreateDateColumn (insert-only với TypeORM) — backdate trực tiếp
    await ds.query(
      `UPDATE call_sessions SET created_at = now() - interval '2 hours' WHERE id = $1`,
      [call.id],
    );

    await ticker.runOnce();

    const fresh = await ds
      .getRepository(CallSession)
      .findOneByOrFail({ id: call.id });
    expect(fresh.status).toBe(CallSessionStatus.Ended);
    expect(fresh.endReason).toBe(CallEndReason.PendingTimeout);
    expect(fresh.durationSeconds).toBe(0); // chưa từng active
    expect(deletedRooms).toContain(call.roomName);

    // join lại sau khi ended → 409
    await expect(
      calling.joinCall(auth(a.id), session.id),
    ).rejects.toMatchObject({ code: 'CALLING_CALL_ENDED' });
  });

  it('webhook participant_left → end completed; end lặp idempotent (không dọn room 2 lần)', async () => {
    const [a, b] = await Promise.all([createUser('w-a'), createUser('w-b')]);
    const call = await activeCall(a, b, 2);

    await calling.handleWebhookEvent({
      event: 'participant_left',
      roomName: call.roomName,
      participantIdentity: b.id,
    });
    const cleanupsAfterFirst = deletedRooms.filter(
      (r) => r === call.roomName,
    ).length;
    // room_finished đến SAU (out-of-order/retry) — no-op
    await calling.handleWebhookEvent({
      event: 'room_finished',
      roomName: call.roomName,
      participantIdentity: null,
    });

    const fresh = await ds
      .getRepository(CallSession)
      .findOneByOrFail({ id: call.id });
    expect(fresh.status).toBe(CallSessionStatus.Ended);
    expect(fresh.endReason).toBe(CallEndReason.Completed);
    expect(deletedRooms.filter((r) => r === call.roomName).length).toBe(
      cleanupsAfterFirst,
    ); // không dọn thêm
  });

  it('IDOR: người ngoài session/call nhận CÙNG 404', async () => {
    const [a, b, outsider] = await Promise.all([
      createUser('x-a'),
      createUser('x-b'),
      createUser('x-out'),
    ]);
    const session = await createVoiceSession(a, b);
    const { call } = await calling.joinCall(auth(a.id), session.id);

    await expect(
      calling.joinCall(auth(outsider.id), session.id),
    ).rejects.toMatchObject({ code: 'CALLING_SESSION_NOT_FOUND' });
    await expect(
      calling.getCall(auth(outsider.id), call.id),
    ).rejects.toMatchObject({ code: 'CALLING_CALL_NOT_FOUND' });
    await expect(
      calling.endCall(auth(outsider.id), call.id),
    ).rejects.toMatchObject({ code: 'CALLING_CALL_NOT_FOUND' });
  });
});
