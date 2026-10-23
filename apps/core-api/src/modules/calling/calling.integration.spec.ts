import { metrics } from '@opentelemetry/api';
import { DataSource } from 'typeorm';

import { SnakeNamingStrategy } from '../../database/snake-naming.strategy';
import { InitAuthUser1751900000000 } from '../../database/migrations/1751900000000-init-auth-user';
import { UserProfilePreferences1755800000000 } from '../../database/migrations/1755800000000-user-profile-preferences';
import { UserRole1753600000000 } from '../../database/migrations/1753600000000-user-role';
import { EconomyLedger1752000000000 } from '../../database/migrations/1752000000000-economy-ledger';
import { OutboxReliability1757000000000 } from '../../database/migrations/1757000000000-outbox-reliability';
import { EconomyRefund1752100000000 } from '../../database/migrations/1752100000000-economy-refund';
import { MatchingCore1752200000000 } from '../../database/migrations/1752200000000-matching-core';
import { MatchingGenderPreference1752300000000 } from '../../database/migrations/1752300000000-matching-gender-preference';
import { SoulMatch1752400000000 } from '../../database/migrations/1752400000000-soul-match';
import { Calling1752500000000 } from '../../database/migrations/1752500000000-calling';
import { Safety1752800000000 } from '../../database/migrations/1752800000000-safety';
import { ReportTargetVideo1754900000000 } from '../../database/migrations/1754900000000-report-target-video';
import { VoiceMatchCompletion1756000000000 } from '../../database/migrations/1756000000000-voice-match-completion';
import { CallingReconnectWindow1756500000000 } from '../../database/migrations/1756500000000-calling-reconnect-window';
import { FriendCalling1757200000000 } from '../../database/migrations/1757200000000-friend-calling';
import { CallCleanupRetry1758900000000 } from '../../database/migrations/1758900000000-call-cleanup-retry';
import { CallFreeDeadlineIndex1759000000000 } from '../../database/migrations/1759000000000-call-free-deadline-index';
import { CallWorkerClaims1759150000000 } from '../../database/migrations/1759150000000-call-worker-claims';
import { MatchingDailyEntitlements1757100000000 } from '../../database/migrations/1757100000000-matching-daily-entitlements';

import { CallingService } from './calling.service';
import { CallTickerService } from './jobs/call-ticker.service';
import {
  CallEndReason,
  CallKind,
  CallSession,
  CallSessionStatus,
} from './entities/call-session.entity';
import { VoiceMatchReaction } from './entities/voice-match-reaction.entity';
import { MatchingService } from '../matching';
import { MatcherWakeup } from '../matching/matcher-wakeup';
import { GuestMatchQuotaService } from '../matching/services/guest-match-quota.service';
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

import { EconomyMetrics } from '../economy/economy.metrics';
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
 * Voice Match hết 7 phút thì server tự end, friend call không bị giới hạn thời lượng,
 * race end-vs-tick. DB riêng `<tên gốc>_calling`.
 */
const INTEGRATION_DB_URL = process.env['INTEGRATION_DB_URL'];
const d = INTEGRATION_DB_URL ? describe : describe.skip;
if (!INTEGRATION_DB_URL) {
  console.warn(
    '[calling.integration] BỎ QUA — set INTEGRATION_DB_URL để chạy bộ test lifecycle trên Postgres thật',
  );
}

jest.setTimeout(60_000);

const CONFIG: Record<string, unknown> = {
  LIVEKIT_URL: 'ws://localhost:7880',
  LIVEKIT_REGION_URLS: '', // single-region — resolver GĐ7 không đụng tới ở suite này
  CALLING_TOKEN_TTL_SECONDS: 120,
  // test backdate thay vì chờ đủ 7 phút thật
  CALLING_FREE_CALL_SECONDS: 420,
  CALLING_PENDING_TIMEOUT_SECONDS: 3600,
  CALLING_RECONNECT_WINDOW_SECONDS: 30,
  CALLING_TICKER_INTERVAL_MS: 1000,
  CALLING_TICK_BUDGET_MS: 1000,
  CALLING_JOB_LEASE_MS: 30_000,
  CALLING_CLEANUP_CONCURRENCY: 2,
  DATABASE_POOL_MAX: 10,
  USER_DEFAULT_AVATAR_ID: 'default-01',
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
  const friendPairs = new Set<string>();
  const livekitStub: LivekitRoomPort = {
    mintJoinToken: async (room, identity) => `tok:${room}:${identity}`,
    deleteRoom: async (room) => {
      deletedRooms.push(room);
    },
    listParticipantIdentities: async () => [],
    receiveWebhook: async () => {
      throw new Error(
        'không dùng trong suite này — verify chữ ký thuộc port SDK',
      );
    },
  };

  const auth = (userId: string): AuthenticatedUser => ({
    userId,
    isGuest: false,
    role: 'user',
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
        VoiceMatchReaction,
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
        UserProfilePreferences1755800000000,
        UserRole1753600000000,
        EconomyLedger1752000000000,
        OutboxReliability1757000000000,
        EconomyRefund1752100000000,
        MatchingCore1752200000000,
        MatchingGenderPreference1752300000000,
        MatchingDailyEntitlements1757100000000,
        SoulMatch1752400000000,
        Calling1752500000000,
        Safety1752800000000,
        ReportTargetVideo1754900000000,
        VoiceMatchCompletion1756000000000,
        CallingReconnectWindow1756500000000,
        FriendCalling1757200000000,
        CallCleanupRetry1758900000000,
        CallFreeDeadlineIndex1759000000000,
        CallWorkerClaims1759150000000,
      ],
      namingStrategy: new SnakeNamingStrategy(),
      extra: { lock_timeout: 1500 },
      migrationsTransactionMode: 'each',
      synchronize: false,
      dropSchema: true,
    });
    await ds.initialize();
    await ds.runMigrations();

    const userService = new UserService(ds.getRepository(User), configStub);
    const ledger = new LedgerService(
      ds,
      new EconomyMetrics(metrics.getMeter('calling-integration')),
    );
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
      // Notification không phải trọng tâm suite này — stub no-op
      {
        createWithManager: async () => ({}),
        sendPush: async () => undefined,
      } as never,
      configStub,
      {} as never,
      {} as never,
      new MatcherWakeup(),
      {
        authorize: async () => undefined,
        consume: async () => undefined,
        consumeForMatch: async () => ({
          quotaDate: '2026-07-29',
          freeLimit: 10,
          tier: null,
          paidDiamond: false,
        }),
      } as unknown as GuestMatchQuotaService,
    );
    calling = new CallingService(
      ds,
      ds.getRepository(CallSession),
      ds.getRepository(VoiceMatchReaction),
      matchingService,
      // Friend graph được stub ở đây; persistence của Friendship đã có suite Friend integration.
      {
        areFriends: async (a: string, b: string) =>
          friendPairs.has([a, b].sort().join(':')),
        ensureFriendship: async () => ({ created: true }),
      } as never,
      {
        canCall: async (a: string, b: string) =>
          friendPairs.has([a, b].sort().join(':')),
      } as never,
      livekitStub,
      configStub,
      userService,
      // stub publish — realtime end-to-end đã test ở suite signaling-gateway
      { publish: async () => 1 } as never,
      // metrics call drop rate không phải trọng tâm suite này — test riêng ở calling.metrics.spec.ts
      { recordEnded: () => undefined } as never,
    );
    ticker = new CallTickerService(ds, configStub, schedulerStub, calling);
    tickerB = new CallTickerService(ds, configStub, schedulerStub, calling);
  });

  afterAll(async () => {
    await ds?.destroy();
  });

  beforeEach(() => {
    deletedRooms.length = 0;
    friendPairs.clear();
  });

  async function tick(instance: CallTickerService): Promise<void> {
    await instance.runOnce();
    await instance.runCleanupOnce();
  }

  it('uses the deadline range index with many fresh calls and few overdue calls', async () => {
    const runner = ds.createQueryRunner();
    await runner.connect();
    try {
      // TypeORM revert uses a transaction even for a transaction=false migration.
      await runner.startTransaction();
      await new CallFreeDeadlineIndex1759000000000().down(runner);
      await runner.commitTransaction();
      await new CallFreeDeadlineIndex1759000000000().up(runner);
    } finally {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      await runner.release();
    }
    const [a, b] = await Promise.all([
      createUser('plan-a'),
      createUser('plan-b'),
    ]);
    try {
      await ds.query(
        `
        INSERT INTO call_sessions (id, room_name, user_a_id, user_b_id, status, call_kind, started_at)
        SELECT gen_random_uuid(), 'deadline-plan-' || i, $1, $2, 'active', 'voice_match',
          CASE WHEN i <= 5 THEN now() - interval '500 seconds' ELSE now() END
          FROM generate_series(1, 5000) AS i
      `,
        [a.id, b.id],
      );
      await ds.query('ANALYZE call_sessions');
      const plans = await ds.query(
        `
        EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
        SELECT id FROM call_sessions
         WHERE status = 'active' AND call_kind = 'voice_match'
           AND reconnect_started_at IS NULL AND started_at IS NOT NULL
           AND started_at <= now() - make_interval(secs => $1)
         ORDER BY started_at, id LIMIT 100 FOR UPDATE SKIP LOCKED
      `,
        [420],
      );
      interface Plan {
        'Index Name'?: string;
        'Index Cond'?: string;
        Plans?: Plan[];
      }
      const nodes: Plan[] = [];
      const visit = (plan: Plan) => {
        nodes.push(plan);
        plan.Plans?.forEach(visit);
      };
      visit(plans[0]['QUERY PLAN'][0].Plan);
      expect(nodes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            'Index Name': 'idx_call_sessions_voice_deadline',
            'Index Cond': expect.stringContaining('started_at'),
          }),
        ]),
      );
    } finally {
      await ds.query('DELETE FROM call_sessions WHERE user_a_id = $1', [a.id]);
    }
  });

  async function recoverBeforeTickerLock(
    callId: string,
    reason: CallEndReason,
    recover: () => Promise<void>,
  ): Promise<void> {
    const original = calling.endById.bind(calling);
    let recovered = false;
    const spy = jest
      .spyOn(calling, 'endById')
      .mockImplementation(async (id, endReason, guard, options) => {
        if (id === callId && endReason === reason && !recovered) {
          recovered = true;
          await recover();
        }
        return original(id, endReason, guard, options);
      });
    try {
      await tick(ticker);
      expect(recovered).toBe(true);
      expect(
        await ds.getRepository(CallSession).findOneByOrFail({ id: callId }),
      ).toMatchObject({
        status: CallSessionStatus.Active,
        cleanupPending: false,
      });
    } finally {
      spy.mockRestore();
    }
  }

  it('pending timeout rechecks under lock after both participants activate the selected call', async () => {
    const [a, b] = await Promise.all([
      createUser('recover-p-a'),
      createUser('recover-p-b'),
    ]);
    const session = await createVoiceSession(a, b);
    const { call } = await calling.joinCall(auth(a.id), session.id);
    await ds.query(
      "UPDATE call_sessions SET created_at = now() - interval '2 hours' WHERE id = $1",
      [call.id],
    );
    await recoverBeforeTickerLock(
      call.id,
      CallEndReason.PendingTimeout,
      async () => {
        for (const user of [a, b]) {
          await calling.handleWebhookEvent({
            event: 'participant_joined',
            roomName: call.roomName,
            participantIdentity: user.id,
          });
        }
      },
    );
    expect(deletedRooms).not.toContain(call.roomName);
  });

  it('reconnect timeout rechecks under lock after the selected participant returns', async () => {
    const [a, b] = await Promise.all([
      createUser('recover-r-a'),
      createUser('recover-r-b'),
    ]);
    const call = await activeCall(a, b, 60);
    await calling.handleWebhookEvent({
      event: 'participant_left',
      roomName: call.roomName,
      participantIdentity: b.id,
    });
    await ds.query(
      "UPDATE call_sessions SET reconnect_started_at = now() - interval '31 seconds' WHERE id = $1",
      [call.id],
    );
    await recoverBeforeTickerLock(call.id, CallEndReason.Completed, () =>
      calling.handleWebhookEvent({
        event: 'participant_joined',
        roomName: call.roomName,
        participantIdentity: b.id,
      }),
    );
    expect(deletedRooms).not.toContain(call.roomName);
  });

  it('free limit rechecks under lock when the selected call starts reconnect grace', async () => {
    const [a, b] = await Promise.all([
      createUser('recover-f-a'),
      createUser('recover-f-b'),
    ]);
    const call = await activeCall(a, b, 430);
    await recoverBeforeTickerLock(call.id, CallEndReason.FreeLimit, () =>
      calling.handleWebhookEvent({
        event: 'participant_left',
        roomName: call.roomName,
        participantIdentity: b.id,
      }),
    );
    expect(deletedRooms).not.toContain(call.roomName);
  });

  it.each(['pending', 'reconnect', 'free-limit', 'cleanup'] as const)(
    '%s skips an older locked row and progresses another call, then retries after unlock',
    async (stage) => {
      const calls: CallSession[] = [];
      for (const suffix of ['locked', 'available']) {
        const [a, b] = await Promise.all([
          createUser(`${stage}-${suffix}-a`),
          createUser(`${stage}-${suffix}-b`),
        ]);
        if (stage === 'pending') {
          const session = await createVoiceSession(a, b);
          const { call } = await calling.joinCall(auth(a.id), session.id);
          calls.push(call);
          await ds.query(
            "UPDATE call_sessions SET created_at = now() - interval '2 hours' WHERE id = $1",
            [call.id],
          );
        } else {
          const call = await activeCall(a, b, 430);
          calls.push(call);
          if (stage === 'reconnect') {
            await calling.handleWebhookEvent({
              event: 'participant_left',
              roomName: call.roomName,
              participantIdentity: b.id,
            });
            await ds.query(
              "UPDATE call_sessions SET reconnect_started_at = now() - interval '31 seconds' WHERE id = $1",
              [call.id],
            );
          } else if (stage === 'cleanup') {
            await calling.endById(call.id, CallEndReason.Completed, undefined, {
              deferCleanup: true,
            });
          }
        }
      }
      const [locked, available] = calls;
      await ds.query(
        "UPDATE call_sessions SET updated_at = now() - interval '3 hours', created_at = now() - interval '3 hours', reconnect_started_at = CASE WHEN reconnect_started_at IS NULL THEN NULL ELSE now() - interval '1 hour' END WHERE id = $1",
        [locked.id],
      );
      const runner = ds.createQueryRunner();
      await runner.connect();
      await runner.startTransaction();
      try {
        await runner.query(
          'SELECT id FROM call_sessions WHERE id = $1 FOR UPDATE',
          [locked.id],
        );
        // A regression must fail quickly rather than hang while this test owns the row lock.
        expect(
          await calling.endById(locked.id, CallEndReason.Completed, undefined, {
            skipLocked: true,
            deferCleanup: true,
          }),
        ).toEqual({ call: null, justEnded: false });
        const tickDeadline = new CallTickerService(
          ds,
          configStub,
          schedulerStub,
          calling,
        );
        await (stage === 'cleanup'
          ? tickDeadline.runCleanupOnce()
          : tickDeadline.runOnce());
        const fresh = await ds
          .getRepository(CallSession)
          .findOneByOrFail({ id: available.id });
        expect(fresh.status).toBe(CallSessionStatus.Ended);
        if (stage === 'cleanup') expect(fresh.cleanupPending).toBe(false);
        expect(deletedRooms).not.toContain(locked.roomName);
        if (stage !== 'cleanup') {
          expect(
            (
              await ds
                .getRepository(CallSession)
                .findOneByOrFail({ id: locked.id })
            ).status,
          ).not.toBe(CallSessionStatus.Ended);
        }
      } finally {
        await runner.rollbackTransaction();
        await runner.release();
      }
      await tick(tickerB);
      expect(
        await ds.getRepository(CallSession).findOneByOrFail({ id: locked.id }),
      ).toMatchObject({
        status: CallSessionStatus.Ended,
        cleanupPending: false,
      });
    },
  );

  it('committed call end retains cleanup after a one-time Matching failure, then ticker retries it', async () => {
    const [a, b] = await Promise.all([
      createUser('cleanup-db-a'),
      createUser('cleanup-db-b'),
    ]);
    const call = await activeCall(a, b, 15);
    const matching = (
      calling as unknown as { matchingService: MatchingService }
    ).matchingService;
    const spy = jest
      .spyOn(matching, 'endVoiceSessionForCall')
      .mockRejectedValueOnce(new Error('transient matching DB failure'));
    try {
      await calling.endById(call.id, CallEndReason.Completed);
      expect(
        await ds.getRepository(CallSession).findOneByOrFail({ id: call.id }),
      ).toMatchObject({
        status: CallSessionStatus.Ended,
        cleanupPending: true,
      });
      expect(
        (
          await ds
            .getRepository(MatchSession)
            .findOneByOrFail({ id: call.matchSessionId! })
        ).status,
      ).toBe(MatchSessionStatus.Confirmed);
      expect(deletedRooms).not.toContain(call.roomName);
      await tick(tickerB);
      expect(
        (
          await ds
            .getRepository(MatchSession)
            .findOneByOrFail({ id: call.matchSessionId! })
        ).status,
      ).toBe(MatchSessionStatus.Ended);
      expect(
        (await ds.getRepository(CallSession).findOneByOrFail({ id: call.id }))
          .cleanupPending,
      ).toBe(false);
      expect(deletedRooms).toContain(call.roomName);
    } finally {
      spy.mockRestore();
    }
  });

  it('SFU deletion failure leaves a durable retry marker until a later ticker succeeds', async () => {
    const [a, b] = await Promise.all([
      createUser('cleanup-sfu-a'),
      createUser('cleanup-sfu-b'),
    ]);
    const call = await activeCall(a, b, 15);
    const spy = jest
      .spyOn(livekitStub, 'deleteRoom')
      .mockRejectedValueOnce(new Error('SFU temporarily unavailable'));
    try {
      await calling.endById(call.id, CallEndReason.Completed);
      expect(
        (await ds.getRepository(CallSession).findOneByOrFail({ id: call.id }))
          .cleanupPending,
      ).toBe(true);
      await tick(tickerB);
      expect(
        (await ds.getRepository(CallSession).findOneByOrFail({ id: call.id }))
          .cleanupPending,
      ).toBe(false);
      expect(deletedRooms).toContain(call.roomName);
    } finally {
      spy.mockRestore();
    }
  });

  it('a fresh ticker discovers cleanup committed before a simulated process crash', async () => {
    const [a, b] = await Promise.all([
      createUser('cleanup-crash-a'),
      createUser('cleanup-crash-b'),
    ]);
    const call = await activeCall(a, b, 15);
    await ds.getRepository(CallSession).update(call.id, {
      status: CallSessionStatus.Ended,
      endedAt: new Date(),
      endReason: CallEndReason.Completed,
      cleanupPending: true,
    });
    const restartedTicker = new CallTickerService(
      ds,
      configStub,
      schedulerStub,
      calling,
    );
    await tick(restartedTicker);
    expect(
      (await ds.getRepository(CallSession).findOneByOrFail({ id: call.id }))
        .cleanupPending,
    ).toBe(false);
    expect(deletedRooms).toContain(call.roomName);
    expect(
      (
        await ds
          .getRepository(MatchSession)
          .findOneByOrFail({ id: call.matchSessionId! })
      ).status,
    ).toBe(MatchSessionStatus.Ended);
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

  it('Voice Match quá free window 7 phút: server tự end, KHÔNG đụng tiền, room được dọn', async () => {
    const [a, b] = await Promise.all([createUser('f-a'), createUser('f-b')]);
    await fund(a.id);
    const before = await balanceOf(a.id);
    const call = await activeCall(a, b, 430); // 430s > free 420s

    await tick(ticker);

    const fresh = await ds
      .getRepository(CallSession)
      .findOneByOrFail({ id: call.id });
    expect(fresh.status).toBe(CallSessionStatus.Ended);
    expect(fresh.endReason).toBe(CallEndReason.FreeLimit);
    expect(fresh.durationSeconds).toBeGreaterThanOrEqual(10);
    expect(deletedRooms).toContain(call.roomName);
    expect(await balanceOf(a.id)).toBe(before); // không trừ đồng nào
  });

  it('race end-vs-tick: call end TRƯỚC tick → tick không trừ đồng nào', async () => {
    const [a, b] = await Promise.all([createUser('r-a'), createUser('r-b')]);
    await Promise.all([fund(a.id), fund(b.id)]);
    const call = await activeCall(a, b, 15);

    await calling.endCall(auth(a.id), call.id);
    await Promise.all([tick(ticker), tick(tickerB)]);

    expect(await balanceOf(a.id)).toBe(1200);
    expect(await balanceOf(b.id)).toBe(1200);
    const fresh = await ds
      .getRepository(CallSession)
      .findOneByOrFail({ id: call.id });
    expect(fresh.endReason).toBe(CallEndReason.Completed);
    expect(fresh.billedMinutes).toBe(0);
  });

  it('mutual friend call: không có MatchSession, không bị giới hạn 7 phút và có thể gọi lại', async () => {
    const [a, b] = await Promise.all([
      createUser('friend-a'),
      createUser('friend-b'),
    ]);
    await expect(
      calling.joinFriendCall(auth(a.id), b.id),
    ).rejects.toMatchObject({
      code: 'CALLING_SESSION_NOT_FOUND',
    });
    friendPairs.add([a.id, b.id].sort().join(':'));

    const first = await calling.joinFriendCall(auth(a.id), b.id);
    const second = await calling.joinFriendCall(auth(b.id), a.id);
    expect(first.call.id).toBe(second.call.id);
    expect(first.call.callKind).toBe(CallKind.Friend);
    expect(first.call.matchSessionId).toBeNull();

    for (const uid of [a.id, b.id]) {
      await calling.handleWebhookEvent({
        event: 'participant_joined',
        roomName: first.call.roomName,
        participantIdentity: uid,
      });
    }
    await ds
      .getRepository(CallSession)
      .update(
        { id: first.call.id },
        { startedAt: new Date(Date.now() - 60 * 60 * 1000) },
      );
    await tick(ticker);

    const fresh = await ds
      .getRepository(CallSession)
      .findOneByOrFail({ id: first.call.id });
    expect(fresh.status).toBe(CallSessionStatus.Active);
    expect(deletedRooms).not.toContain(first.call.roomName);
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

    await tick(ticker);

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

  it('webhook disconnect → pause timer, quá reconnect grace mới end idempotent', async () => {
    const [a, b] = await Promise.all([createUser('w-a'), createUser('w-b')]);
    const call = await activeCall(a, b, 2);

    await calling.handleWebhookEvent({
      event: 'participant_left',
      roomName: call.roomName,
      participantIdentity: b.id,
    });
    const disconnected = await calling.getCall(auth(a.id), call.id);
    const polled = await calling.getCall(auth(a.id), call.id);
    expect(polled.status).toBe(CallSessionStatus.Active);
    expect(polled.reconnectStartedAt).toEqual(disconnected.reconnectStartedAt);
    await tick(ticker);
    let fresh = await ds
      .getRepository(CallSession)
      .findOneByOrFail({ id: call.id });
    expect(fresh.status).toBe(CallSessionStatus.Active);
    expect(fresh.reconnectStartedAt).not.toBeNull();
    expect(deletedRooms).not.toContain(call.roomName);

    // Giả lập quá cửa sổ 30s; ticker mới được phép terminal hóa call.
    await ds.query(
      `UPDATE call_sessions SET reconnect_started_at = now() - interval '31 seconds' WHERE id = $1`,
      [call.id],
    );
    await tick(ticker);
    fresh = await ds
      .getRepository(CallSession)
      .findOneByOrFail({ id: call.id });
    expect(fresh.status).toBe(CallSessionStatus.Ended);
    expect(fresh.endReason).toBe(CallEndReason.Completed);
    const cleanupsAfterFirst = deletedRooms.filter(
      (r) => r === call.roomName,
    ).length;

    // room_finished đến SAU (out-of-order/retry) — no-op
    await calling.handleWebhookEvent({
      event: 'room_finished',
      roomName: call.roomName,
      participantIdentity: null,
    });

    expect(deletedRooms.filter((r) => r === call.roomName).length).toBe(
      cleanupsAfterFirst,
    ); // không dọn thêm
  });

  it('disconnect → GET → rejoin retains active call and pauses its server timer', async () => {
    const [a, b] = await Promise.all([
      createUser('get-a'),
      createUser('get-b'),
    ]);
    const call = await activeCall(a, b, 2);
    await calling.handleWebhookEvent({
      event: 'participant_left',
      roomName: call.roomName,
      participantIdentity: b.id,
    });
    await ds.query(
      "UPDATE call_sessions SET reconnect_started_at = now() - interval '5 seconds' WHERE id = $1",
      [call.id],
    );
    const probe = jest
      .spyOn(livekitStub, 'listParticipantIdentities')
      .mockResolvedValueOnce([a.id]);
    let duringGrace: CallSession;
    try {
      duringGrace = await calling.getCall(auth(a.id), call.id);
    } finally {
      probe.mockRestore();
    }
    expect(duringGrace.status).toBe(CallSessionStatus.Active);
    expect(duringGrace.reconnectStartedAt).not.toBeNull();
    await calling.handleWebhookEvent({
      event: 'participant_joined',
      roomName: call.roomName,
      participantIdentity: b.id,
    });
    await tick(ticker);

    const resumed = await ds
      .getRepository(CallSession)
      .findOneByOrFail({ id: call.id });
    expect(resumed.status).toBe(CallSessionStatus.Active);
    expect(resumed.reconnectStartedAt).toBeNull();
    expect(resumed.disconnectedBAt).toBeNull();
    expect(resumed.startedAt!.getTime()).toBeGreaterThanOrEqual(
      call.startedAt!.getTime() + 5_000,
    );
    expect(deletedRooms).not.toContain(call.roomName);
  });

  it('SFU GET snapshot finishing after a committed rejoin cannot reopen reconnect grace', async () => {
    const [a, b] = await Promise.all([
      createUser('race-get-a'),
      createUser('race-get-b'),
    ]);
    const call = await activeCall(a, b, 2);
    await calling.handleWebhookEvent({
      event: 'participant_left',
      roomName: call.roomName,
      participantIdentity: b.id,
    });
    let observationStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      observationStarted = resolve;
    });
    let finishObservation!: (identities: string[]) => void;
    const snapshot = new Promise<string[]>((resolve) => {
      finishObservation = resolve;
    });
    const probe = jest
      .spyOn(livekitStub, 'listParticipantIdentities')
      .mockImplementationOnce(() => {
        observationStarted();
        return snapshot;
      });
    const pendingGet = calling.getCall(auth(a.id), call.id);
    try {
      await started;
      await calling.handleWebhookEvent({
        event: 'participant_joined',
        roomName: call.roomName,
        participantIdentity: b.id,
      });
    } finally {
      finishObservation([a.id]);
      probe.mockRestore();
    }
    const result = await pendingGet;

    expect(result.status).toBe(CallSessionStatus.Active);
    expect(result.reconnectStartedAt).toBeNull();
    expect(result.disconnectedBAt).toBeNull();
    expect(deletedRooms).not.toContain(call.roomName);
  });

  it('SFU recovers lost joined webhooks, accounts the pause and prevents ticker ending a healthy call', async () => {
    const [a, b] = await Promise.all([
      createUser('sfu-resume-a'),
      createUser('sfu-resume-b'),
    ]);
    const call = await activeCall(a, b, 425);
    await calling.handleWebhookEvent({
      event: 'room_finished',
      roomName: call.roomName,
      participantIdentity: null,
    });
    await ds.query(
      "UPDATE call_sessions SET reconnect_started_at = now() - interval '31 seconds' WHERE id = $1",
      [call.id],
    );
    const probe = jest
      .spyOn(livekitStub, 'listParticipantIdentities')
      .mockResolvedValueOnce([a.id, b.id]);
    let resumed: CallSession;
    try {
      resumed = await calling.getCall(auth(a.id), call.id);
    } finally {
      probe.mockRestore();
    }
    expect(resumed.reconnectStartedAt).toBeNull();
    expect(resumed.disconnectedAAt).toBeNull();
    expect(resumed.disconnectedBAt).toBeNull();
    expect(resumed.startedAt!.getTime()).toBeGreaterThanOrEqual(
      call.startedAt!.getTime() + 31_000,
    );
    await tick(ticker);

    const fresh = await ds
      .getRepository(CallSession)
      .findOneByOrFail({ id: call.id });
    expect(fresh.status).toBe(CallSessionStatus.Active);
    expect(deletedRooms).not.toContain(call.roomName);
  });

  it('stale SFU presence cannot clear a concurrent disconnect committed while fetching participants', async () => {
    const [a, b] = await Promise.all([
      createUser('sfu-stale-a'),
      createUser('sfu-stale-b'),
    ]);
    const call = await activeCall(a, b, 2);
    await calling.handleWebhookEvent({
      event: 'participant_left',
      roomName: call.roomName,
      participantIdentity: b.id,
    });
    let observationStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      observationStarted = resolve;
    });
    let finishObservation!: (identities: string[]) => void;
    const snapshot = new Promise<string[]>((resolve) => {
      finishObservation = resolve;
    });
    const probe = jest
      .spyOn(livekitStub, 'listParticipantIdentities')
      .mockImplementationOnce(() => {
        observationStarted();
        return snapshot;
      });
    const pendingGet = calling.getCall(auth(a.id), call.id);
    try {
      await started;
      await calling.handleWebhookEvent({
        event: 'participant_left',
        roomName: call.roomName,
        participantIdentity: a.id,
      });
    } finally {
      finishObservation([a.id, b.id]);
      probe.mockRestore();
    }
    const result = await pendingGet;

    expect(result.status).toBe(CallSessionStatus.Active);
    expect(result.reconnectStartedAt).not.toBeNull();
    expect(result.disconnectedAAt).not.toBeNull();
    expect(result.disconnectedBAt).not.toBeNull();
    expect(deletedRooms).not.toContain(call.roomName);
  });

  it('pending SFU snapshot cannot override webhook activation followed by a newer disconnect', async () => {
    const [a, b] = await Promise.all([
      createUser('sfu-pending-a'),
      createUser('sfu-pending-b'),
    ]);
    const session = await createVoiceSession(a, b);
    const { call } = await calling.joinCall(auth(a.id), session.id);
    expect(call.status).toBe(CallSessionStatus.Pending);
    let observationStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      observationStarted = resolve;
    });
    let finishObservation!: (identities: string[]) => void;
    const snapshot = new Promise<string[]>((resolve) => {
      finishObservation = resolve;
    });
    const probe = jest
      .spyOn(livekitStub, 'listParticipantIdentities')
      .mockImplementationOnce(() => {
        observationStarted();
        return snapshot;
      });
    const pendingGet = calling.getCall(auth(a.id), call.id);
    let beforeSnapshot!: CallSession;
    try {
      await started;
      for (const identity of [a.id, b.id]) {
        await calling.handleWebhookEvent({
          event: 'participant_joined',
          roomName: call.roomName,
          participantIdentity: identity,
        });
      }
      await calling.handleWebhookEvent({
        event: 'participant_left',
        roomName: call.roomName,
        participantIdentity: b.id,
      });
      beforeSnapshot = await ds
        .getRepository(CallSession)
        .findOneByOrFail({ id: call.id });
    } finally {
      finishObservation([a.id, b.id]);
      probe.mockRestore();
    }
    const result = await pendingGet;
    expect(result.status).toBe(CallSessionStatus.Active);
    expect(result.reconnectStartedAt).toEqual(
      beforeSnapshot.reconnectStartedAt,
    );
    expect(result.disconnectedBAt).toEqual(beforeSnapshot.disconnectedBAt);
    expect(result.reconnectStartedAt).not.toBeNull();
    expect(result.startedAt).toEqual(beforeSnapshot.startedAt);
    await tick(ticker);
    const fresh = await ds
      .getRepository(CallSession)
      .findOneByOrFail({ id: call.id });
    expect(fresh.status).toBe(CallSessionStatus.Active);
    expect(fresh.reconnectStartedAt).toEqual(beforeSnapshot.reconnectStartedAt);
    expect(fresh.startedAt).toEqual(beforeSnapshot.startedAt);
    expect(deletedRooms).not.toContain(call.roomName);
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
