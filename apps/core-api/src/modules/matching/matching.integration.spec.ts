import Redis from 'ioredis';
import { DataSource, In, Repository } from 'typeorm';

import { SnakeNamingStrategy } from '../../database/snake-naming.strategy';
import { InitAuthUser1751900000000 } from '../../database/migrations/1751900000000-init-auth-user';
import { EconomyLedger1752000000000 } from '../../database/migrations/1752000000000-economy-ledger';
import { EconomyRefund1752100000000 } from '../../database/migrations/1752100000000-economy-refund';
import { MatchingCore1752200000000 } from '../../database/migrations/1752200000000-matching-core';
import { MatchingHardening1752300000000 } from '../../database/migrations/1752300000000-matching-hardening';
import { AuthIdentity } from '../auth/entities/auth-identity.entity';
import { PhoneOtp } from '../auth/entities/phone-otp.entity';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { Gender, User } from '../user/entities/user.entity';
import { UserService } from '../user/user.service';
import { EconomyService } from '../economy/economy.service';
import { LedgerService } from '../economy/ledger.service';
import { LedgerAccount } from '../economy/entities/ledger-account.entity';
import { LedgerEntry } from '../economy/entities/ledger-entry.entity';
import { OutboxEvent } from '../economy/entities/outbox-event.entity';
import { LedgerTransaction, TransactionType } from '../economy/entities/transaction.entity';
import { Wallet } from '../economy/entities/wallet.entity';
import { IapProduct, IapProvider, IapReceipt } from '../economy/entities/iap.entities';
import { VipPlan } from '../economy/entities/vip-plan.entity';

import { MatchingErrors } from './matching.errors';
import { MatchingService } from './matching.service';
import { MatcherWorkerService } from './matcher-worker.service';
import { TicketSweeperService } from './ticket-sweeper.service';
import { MatchingQueueStore } from './redis/matching-queue.script';
import { MatchingQueueProjectionService } from './matching-queue-projection.service';
import { MatchingOperationRecoveryService } from './matching-operation-recovery.service';
import { MatchSession } from './entities/match-session.entity';
import { MatchTicket, MatchTicketStatus, MatchType } from './entities/match-ticket.entity';
import {
  MatchingOperation,
  MatchingOperationKind,
  MatchingOperationStatus,
} from './entities/matching-operation.entity';
import { MatchingQueueOutbox } from './entities/matching-queue-outbox.entity';

import type { ConfigService } from '@nestjs/config';
import type { SchedulerRegistry } from '@nestjs/schedule';
import type { IapVerifier } from '../economy/services/iap-verifier';
import type { CreateMatchTicketDto } from './dto/matching.dtos';

/**
 * Integration test RACE CONDITION cho Matching trên Postgres + Redis thật (docs/05 § 5.9 —
 * bắt buộc cho Matching, không chỉ Economy). Chạy khi có INTEGRATION_DB_URL (docker compose
 * up -d Postgres + Redis trước — xem CLAUDE.md).
 */
const INTEGRATION_DB_URL = process.env['INTEGRATION_DB_URL'];
const d = INTEGRATION_DB_URL ? describe : describe.skip;
if (!INTEGRATION_DB_URL) {
  console.warn('[matching.integration] BỎ QUA — set INTEGRATION_DB_URL để chạy bộ test race trên Postgres+Redis thật');
}

jest.setTimeout(60_000);

const MATCHING_CONFIG: Record<string, number | string> = {
  MATCHING_QUEUE_MAX_WAIT_SECONDS: 120,
  MATCHING_CONFIRM_TIMEOUT_SECONDS: 15,
  MATCHING_AGE_BAND_SIZE: 5,
  MATCHING_SPEEDUP_PRICE_DIAMOND: 50,
  MATCHING_SPEEDUP_MAX_PER_HOUR: 3,
  MATCHING_PRIORITY_BOOST_MS: 300_000,
  MATCHING_MATCHER_BATCH_SIZE: 20,
  MATCHING_QUEUE_LEASE_MS: 1000,
  MATCHING_QUEUE_OUTBOX_BATCH_SIZE: 100,
  MATCHING_REDIS_NAMESPACE: `matching:test:${process.pid}`,
  MATCHING_GUEST_DAILY_TICKET_LIMIT: 3,
};
const configStub = { getOrThrow: (k: string) => MATCHING_CONFIG[k] } as unknown as ConfigService;
const schedulerStub = {
  addInterval: () => undefined,
  deleteInterval: () => undefined,
  doesExist: () => false,
} as unknown as SchedulerRegistry;

d('Matching integration (Postgres + Redis thật)', () => {
  let ds: DataSource;
  let redis: Redis;
  let queue: MatchingQueueStore;
  let matchingService: MatchingService;
  let matcherWorker: MatcherWorkerService;
  let sweeper: TicketSweeperService;
  let projection: MatchingQueueProjectionService;
  let economy: EconomyService;
  let ticketRepo: Repository<MatchTicket>;

  const stubVerifier: IapVerifier = {
    verify: async (_p: IapProvider, payload: Record<string, unknown>) => ({
      providerTransactionId: String(payload['devTransactionId']),
    }),
  } as IapVerifier;

  const createUser = async (over: { gender: Gender; region?: string; isGuest?: boolean }) =>
    ds.getRepository(User).save(
      ds.getRepository(User).create({
        nickname: `test-${Math.random().toString(36).slice(2, 8)}`,
        avatarId: 'default-01',
        isGuest: over.isGuest ?? false,
        gender: over.gender,
        birthDate: '2000-01-01', // cùng ngày sinh cho mọi user test → cùng ageBand, tránh flaky biên
        region: over.region ?? 'SEA',
      }),
    );

  // Mỗi kịch bản test dùng 1 region riêng → shard key riêng (matchType, region, ageBand — docs/03 § 3.8.B),
  // tránh ticket "mồ côi" của test trước (vd rate-limit test) lẫn vào shard của test sau gây flaky.
  const soulTicketDto = (_region: string, criteria: Partial<CreateMatchTicketDto['criteria']> = {}): CreateMatchTicketDto => ({
    matchType: MatchType.Soul,
    criteria: { genderPref: 'any', minAge: 18, maxAge: 99, ...criteria },
  });

  const clearMatchingRedis = async (): Promise<void> => {
    let cursor = '0';
    const pattern = `${MATCHING_CONFIG['MATCHING_REDIS_NAMESPACE']}*`;
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 500);
      cursor = next;
      if (keys.length > 0) await redis.unlink(...keys);
    } while (cursor !== '0');
  };

  beforeAll(async () => {
    // DB test RIÊNG cho Matching (đuôi "_matching") — economy.integration.spec.ts cũng dropSchema
    // trên INTEGRATION_DB_URL gốc; Jest chạy các file spec song song ở worker khác nhau nên 2 suite
    // dùng chung 1 DB sẽ đụng độ tạo bảng/kiểu dữ liệu cùng lúc (đã thấy lỗi "duplicate key
    // pg_type_typname_nsp_index" khi chạy chung) — tách DB loại bỏ hoàn toàn việc đụng độ này.
    const testUrl = new URL(INTEGRATION_DB_URL as string);
    testUrl.pathname = `${testUrl.pathname}_matching`;
    const dbName = testUrl.pathname.slice(1);
    const adminUrl = new URL(INTEGRATION_DB_URL as string);
    adminUrl.pathname = '/postgres';
    const admin = new DataSource({ type: 'postgres', url: adminUrl.toString() });
    await admin.initialize();
    const exists = await admin.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [dbName]);
    if (exists.length === 0) await admin.query(`CREATE DATABASE "${dbName}"`);
    await admin.destroy();

    ds = new DataSource({
      type: 'postgres',
      url: testUrl.toString(),
      entities: [
        User, AuthIdentity, RefreshToken, PhoneOtp,
        LedgerAccount, LedgerTransaction, LedgerEntry, Wallet, IapProduct, IapReceipt, VipPlan, OutboxEvent,
        MatchTicket, MatchSession, MatchingOperation, MatchingQueueOutbox,
      ],
      migrations: [
        InitAuthUser1751900000000,
        EconomyLedger1752000000000,
        EconomyRefund1752100000000,
        MatchingCore1752200000000,
        MatchingHardening1752300000000,
      ],
      namingStrategy: new SnakeNamingStrategy(),
      synchronize: false,
      dropSchema: true,
    });
    await ds.initialize();
    await ds.runMigrations();

    redis = new Redis(process.env['REDIS_URL'] ?? 'redis://localhost:6379');
    await clearMatchingRedis();

    const ledger = new LedgerService(ds);
    const userService = new UserService(ds.getRepository(User), configStub);
    economy = new EconomyService(
      ds.getRepository(Wallet),
      ds.getRepository(IapProduct),
      ds.getRepository(VipPlan),
      ds.getRepository(LedgerTransaction),
      ledger,
      stubVerifier,
      userService,
    );
    queue = new MatchingQueueStore(redis, configStub);
    ticketRepo = ds.getRepository(MatchTicket);

    matchingService = new MatchingService(
      ticketRepo,
      ds.getRepository(MatchingOperation),
      ds,
      userService,
      economy,
      configStub,
    );
    matcherWorker = new MatcherWorkerService(ticketRepo, ds, configStub, queue, schedulerStub);
    sweeper = new TicketSweeperService(ticketRepo, ds, configStub, schedulerStub);
    projection = new MatchingQueueProjectionService(ticketRepo, ds, queue, configStub, schedulerStub);
  });

  afterAll(async () => {
    await clearMatchingRedis();
    await ds?.destroy();
    await redis?.quit();
  });

  it('idempotency key: gửi lại request tạo ticket 2 lần → chỉ 1 hàng, trả về đúng ticket cũ', async () => {
    const user = await createUser({ gender: Gender.Male, region: 'R-IDEM' });
    const first = await matchingService.createTicket(user.id, soulTicketDto('R-IDEM'), 'create-key-1');
    const second = await matchingService.createTicket(user.id, soulTicketDto('R-IDEM'), 'create-key-1');
    expect(second.id).toBe(first.id);
    expect(await ticketRepo.countBy({ userId: user.id })).toBe(1);
  });

  it('create idempotency scope theo user; cùng user/key nhưng payload khác → 409', async () => {
    const userA = await createUser({ gender: Gender.Male, region: 'R-IDEMS-A' });
    const userB = await createUser({ gender: Gender.Female, region: 'R-IDEMS-B' });
    const a = await matchingService.createTicket(userA.id, soulTicketDto('ignored'), 'shared-client-key');
    const b = await matchingService.createTicket(userB.id, soulTicketDto('ignored'), 'shared-client-key');
    expect(a.id).not.toBe(b.id);
    await expect(
      matchingService.createTicket(
        userA.id,
        soulTicketDto('ignored', { minAge: 25 }),
        'shared-client-key',
      ),
    ).rejects.toMatchObject({ code: MatchingErrors.IDEMPOTENCY_CONFLICT });
  });

  it('region của ticket derive từ User, không nhận shard tùy ý từ request', async () => {
    const user = await createUser({ gender: Gender.Male, region: 'PROFILE-R' });
    const ticket = await matchingService.createTicket(user.id, soulTicketDto('CLIENT-R'), 'server-region');
    expect((await ticketRepo.findOneByOrFail({ id: ticket.id })).region).toBe('PROFILE-R');
  });

  it('unique-active-ticket: user đã có ticket queued → tạo ticket thứ 2 (key khác) bị chặn 409, không tạo hàng thứ 2', async () => {
    const user = await createUser({ gender: Gender.Female, region: 'R-UNIQ' });
    await matchingService.createTicket(user.id, soulTicketDto('R-UNIQ'), 'active-key-1');
    await expect(matchingService.createTicket(user.id, soulTicketDto('R-UNIQ'), 'active-key-2')).rejects.toMatchObject({
      code: MatchingErrors.TICKET_ALREADY_QUEUED,
    });
    expect(await ticketRepo.countBy({ userId: user.id })).toBe(1);
  });

  it('guest quota tính theo createdAt và guest bị cấm speed-up ở service', async () => {
    const user = await createUser({ gender: Gender.Male, region: 'R-GUEST', isGuest: true });
    const limit = MATCHING_CONFIG['MATCHING_GUEST_DAILY_TICKET_LIMIT'] as number;
    for (let index = 0; index < limit; index++) {
      const ticket = await matchingService.createTicket(user.id, soulTicketDto('ignored'), `guest-${index}`);
      await matchingService.cancelTicket(user.id, ticket.id);
    }
    await expect(
      matchingService.createTicket(user.id, soulTicketDto('ignored'), 'guest-over-limit'),
    ).rejects.toMatchObject({ code: MatchingErrors.GUEST_DAILY_LIMIT });

    const normalGuest = await createUser({ gender: Gender.Female, region: 'R-GSPD', isGuest: true });
    const ticket = await matchingService.createTicket(normalGuest.id, soulTicketDto('ignored'), 'guest-speed-ticket');
    await expect(matchingService.applySpeedup(normalGuest.id, ticket.id, 'guest-speed')).rejects.toMatchObject({
      code: MatchingErrors.GUEST_SPEEDUP_FORBIDDEN,
    });
  });

  it('double-lock ghép cặp: nhiều "matcher worker" tick đồng thời trên cùng shard → không double-pair', async () => {
    const userA = await createUser({ gender: Gender.Male, region: 'R-DLOCK' });
    const userB = await createUser({ gender: Gender.Female, region: 'R-DLOCK' });
    const ticketA = await matchingService.createTicket(userA.id, soulTicketDto('R-DLOCK'), 'race-a');
    const ticketB = await matchingService.createTicket(userB.id, soulTicketDto('R-DLOCK'), 'race-b');

    await projection.flushOnce();
    const workers = Array.from(
      { length: 3 },
      () => new MatcherWorkerService(ticketRepo, ds, configStub, queue, schedulerStub),
    );
    await Promise.all(workers.map((worker) => worker.tickOnce()));

    const freshA = await ticketRepo.findOneByOrFail({ id: ticketA.id });
    const freshB = await ticketRepo.findOneByOrFail({ id: ticketB.id });
    expect(freshA.status).toBe(MatchTicketStatus.Matched);
    expect(freshB.status).toBe(MatchTicketStatus.Matched);
    expect(freshA.pairedTicketId).toBe(ticketB.id);
    expect(freshB.pairedTicketId).toBe(ticketA.id);

    // Cả 2 confirm → tạo đúng 1 MatchSession
    const [confirmA, confirmARetry] = await Promise.all([
      matchingService.confirmTicket(userA.id, ticketA.id),
      matchingService.confirmTicket(userA.id, ticketA.id),
    ]);
    expect(confirmA.matchSessionId).toBeNull();
    expect(confirmARetry.status).toBe(MatchTicketStatus.Confirmed);
    await expect(
      matchingService.createTicket(userA.id, soulTicketDto('ignored'), 'confirmed-cannot-requeue'),
    ).rejects.toMatchObject({ code: MatchingErrors.TICKET_ALREADY_QUEUED });
    const confirmB = await matchingService.confirmTicket(userB.id, ticketB.id);
    expect(confirmB.matchSessionId).toBeTruthy();
    await expect(matchingService.confirmTicket(userA.id, ticketA.id)).resolves.toMatchObject({
      status: MatchTicketStatus.Confirmed,
      matchSessionId: confirmB.matchSessionId,
    });

    const session = await ds.getRepository(MatchSession).findOneByOrFail({ id: confirmB.matchSessionId as string });
    expect([session.userAId, session.userBId].sort()).toEqual([userA.id, userB.id].sort());
  });

  it('lease hết hạn phục hồi ticket khi matcher chết sau claim, không mất batch', async () => {
    const userA = await createUser({ gender: Gender.Male, region: 'R-LEASE' });
    const userB = await createUser({ gender: Gender.Female, region: 'R-LEASE' });
    const ticketA = await matchingService.createTicket(userA.id, soulTicketDto('ignored'), 'lease-a');
    const ticketB = await matchingService.createTicket(userB.id, soulTicketDto('ignored'), 'lease-b');
    await projection.flushOnce();
    const fresh = await ticketRepo.findOneByOrFail({ id: ticketA.id });
    const shard = queue.shardKey(fresh.matchType, fresh.region, queue.ageBand(fresh.ownAge));
    expect(await queue.claimBatch(shard, 20, 'crashed-worker')).toHaveLength(2);
    await new Promise((resolve) => setTimeout(resolve, 1100));
    await matcherWorker.tickOnce();
    expect((await ticketRepo.findOneByOrFail({ id: ticketA.id })).pairedTicketId).toBe(ticketB.id);
  });

  it('2 phía confirm ĐỒNG THỜI (race thật, không tuần tự) → đúng 1 MatchSession, không deadlock (docs/10 § 10.0)', async () => {
    const userA = await createUser({ gender: Gender.Male, region: 'R-CONFRACE' });
    const userB = await createUser({ gender: Gender.Female, region: 'R-CONFRACE' });
    const ticketA = await matchingService.createTicket(userA.id, soulTicketDto('R-CONFRACE'), 'confirm-race-a');
    const ticketB = await matchingService.createTicket(userB.id, soulTicketDto('R-CONFRACE'), 'confirm-race-b');
    await projection.flushOnce();
    await matcherWorker.tickOnce();

    const results = await Promise.all([
      matchingService.confirmTicket(userA.id, ticketA.id),
      matchingService.confirmTicket(userB.id, ticketB.id),
    ]);

    // Đúng 1 trong 2 response mang matchSessionId (người xác nhận sau, khi thấy đối phương đã confirm),
    // KHÔNG phải cả 2 đều null (bug: không ai tạo session) hay cả 2 đều có nhưng khác id (double-session).
    const sessionIds = results.map((r) => r.matchSessionId).filter((id): id is string => id !== null);
    expect(sessionIds.length).toBe(1);

    const sessions = await ds.getRepository(MatchSession).findBy({ userAId: In([userA.id, userB.id]) });
    const sessionsB = await ds.getRepository(MatchSession).findBy({ userBId: In([userA.id, userB.id]) });
    const allSessions = [...sessions, ...sessionsB.filter((s) => !sessions.some((x) => x.id === s.id))];
    expect(allSessions.length).toBe(1); // không tạo 2 session cho cùng 1 cặp

    const freshA = await ticketRepo.findOneByOrFail({ id: ticketA.id });
    const freshB = await ticketRepo.findOneByOrFail({ id: ticketB.id });
    expect(freshA.matchSessionId).toBe(allSessions[0].id);
    expect(freshB.matchSessionId).toBe(allSessions[0].id);
  });

  it('lọc tiêu chí 2 chiều: 4 ticket trong 1 shard, 1 cặp không tương thích → vẫn ghép đúng 2 cặp hợp lệ', async () => {
    // A, B: nam muốn nữ (không tương thích lẫn nhau) — C, D: nữ muốn any
    const userA = await createUser({ gender: Gender.Male, region: 'R-FILTER' });
    const userB = await createUser({ gender: Gender.Male, region: 'R-FILTER' });
    const userC = await createUser({ gender: Gender.Female, region: 'R-FILTER' });
    const userD = await createUser({ gender: Gender.Female, region: 'R-FILTER' });

    const region = 'R-FILTER';
    const ticketA = await matchingService.createTicket(userA.id, soulTicketDto(region, { genderPref: Gender.Female }), 'filter-a');
    const ticketB = await matchingService.createTicket(userB.id, soulTicketDto(region, { genderPref: Gender.Female }), 'filter-b');
    const ticketC = await matchingService.createTicket(userC.id, soulTicketDto(region, { genderPref: 'any' }), 'filter-c');
    const ticketD = await matchingService.createTicket(userD.id, soulTicketDto(region, { genderPref: 'any' }), 'filter-d');

    await projection.flushOnce();
    await matcherWorker.tickOnce();

    const ids = [ticketA.id, ticketB.id, ticketC.id, ticketD.id];
    const rows = await ticketRepo.findBy({ id: In(ids) });
    const byId = new Map(rows.map((r) => [r.id, r]));

    // A và B (2 nam cùng muốn nữ) không bao giờ được ghép với nhau
    expect(byId.get(ticketA.id)?.pairedTicketId).not.toBe(ticketB.id);
    expect(byId.get(ticketB.id)?.pairedTicketId).not.toBe(ticketA.id);
    // Tất cả đều đã được ghép (không ai bị bỏ lại) — genderPref='any' của C/D đủ linh hoạt ghép hết A/B
    for (const id of ids) expect(byId.get(id)?.status).toBe(MatchTicketStatus.Matched);
  });

  it('cancel đua với pairing → không rơi vào trạng thái mâu thuẫn (docs/10 § 10.0.C)', async () => {
    const userA = await createUser({ gender: Gender.Male, region: 'R-CANCEL' });
    const userB = await createUser({ gender: Gender.Female, region: 'R-CANCEL' });
    const ticketA = await matchingService.createTicket(userA.id, soulTicketDto('R-CANCEL'), 'cancel-race-a');
    const ticketB = await matchingService.createTicket(userB.id, soulTicketDto('R-CANCEL'), 'cancel-race-b');

    await projection.flushOnce();
    const [cancelResult, tickResult] = await Promise.allSettled([
      matchingService.cancelTicket(userA.id, ticketA.id),
      matcherWorker.tickOnce(),
    ]);
    void tickResult;

    const freshA = await ticketRepo.findOneByOrFail({ id: ticketA.id });
    const freshB = await ticketRepo.findOneByOrFail({ id: ticketB.id });

    if (freshA.status === MatchTicketStatus.Cancelled) {
      expect(cancelResult.status).toBe('fulfilled');
      // B không được kẹt ở trạng thái tin rằng đã ghép với 1 ticket đã huỷ
      expect(freshB.pairedTicketId).not.toBe(ticketA.id);
      expect(freshB.status).not.toBe(MatchTicketStatus.Matched);
    } else {
      // Pairing thắng — cả 2 phải khớp lẫn nhau đúng, cancel phải bị từ chối rõ ràng chứ không lặng lẽ "thành công nửa vời"
      expect(freshA.status).toBe(MatchTicketStatus.Matched);
      expect(freshB.status).toBe(MatchTicketStatus.Matched);
      expect(freshA.pairedTicketId).toBe(ticketB.id);
      expect(freshB.pairedTicketId).toBe(ticketA.id);
      expect(cancelResult.status).toBe('rejected');
    }
  });

  it('speed-up: 2 request cùng idempotency key đồng thời → chỉ trừ diamond đúng 1 lần', async () => {
    const user = await createUser({ gender: Gender.Male, region: 'R-SPDUP' });
    await economy.creditFromIap(user.id, IapProvider.Google, { devTransactionId: `speedup-credit-${user.id}` }, 'com.litmatch.diamond.1200');
    const ticket = await matchingService.createTicket(user.id, soulTicketDto('R-SPDUP'), 'speedup-ticket');
    const before = BigInt((await economy.getWallet(user.id)).balance);

    const results = await Promise.allSettled([
      matchingService.applySpeedup(user.id, ticket.id, 'dup-speedup-key'),
      matchingService.applySpeedup(user.id, ticket.id, 'dup-speedup-key'),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled').length).toBe(2); // cùng key → cả 2 đều trả thành công (1 fresh + 1 replay)

    const after = BigInt((await economy.getWallet(user.id)).balance);
    expect(before - after).toBe(BigInt(MATCHING_CONFIG['MATCHING_SPEEDUP_PRICE_DIAMOND'] as number)); // trừ đúng 1 lần

    const freshTicket = await ticketRepo.findOneByOrFail({ id: ticket.id });
    expect(freshTicket.priority).toBe(true);
    await expect(matchingService.applySpeedup(user.id, ticket.id, 'dup-speedup-key')).resolves.toMatchObject({
      priority: true,
    });
  });

  it('speed-up: concurrent key khác nhau trên cùng ticket → chỉ operation thắng được charge', async () => {
    const user = await createUser({ gender: Gender.Male, region: 'R-SPDKEY' });
    await economy.creditFromIap(
      user.id,
      IapProvider.Google,
      { devTransactionId: `speedup-key-credit-${user.id}` },
      'com.litmatch.diamond.1200',
    );
    const ticket = await matchingService.createTicket(user.id, soulTicketDto('ignored'), 'speedup-key-ticket');
    const before = BigInt((await economy.getWallet(user.id)).balance);
    const results = await Promise.allSettled([
      matchingService.applySpeedup(user.id, ticket.id, 'different-a'),
      matchingService.applySpeedup(user.id, ticket.id, 'different-b'),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const after = BigInt((await economy.getWallet(user.id)).balance);
    expect(before - after).toBe(50n);
    expect(
      await ds.getRepository(MatchingOperation).countBy({
        ticketId: ticket.id,
        status: MatchingOperationStatus.Applied,
      }),
    ).toBe(1);
  });

  it('background recovery dùng snapshot price/boost của operation, không đọc config mới sau crash', async () => {
    const user = await createUser({ gender: Gender.Male, region: 'R-RECOVER' });
    await economy.creditFromIap(
      user.id,
      IapProvider.Google,
      { devTransactionId: `recover-credit-${user.id}` },
      'com.litmatch.diamond.1200',
    );
    const ticket = await matchingService.createTicket(user.id, soulTicketDto('ignored'), 'recover-ticket');
    const operationRepo = ds.getRepository(MatchingOperation);
    await operationRepo.save(
      operationRepo.create({
        userId: user.id,
        ticketId: ticket.id,
        kind: MatchingOperationKind.Speedup,
        idempotencyKey: 'recover-operation',
        requestHash: 'b'.repeat(64),
        priceDiamond: '50',
        priorityBoostMs: 123_456,
        policyVersion: 1,
        status: MatchingOperationStatus.Pending,
        economyTransactionId: null,
        appliedAt: null,
      }),
    );
    const before = BigInt((await economy.getWallet(user.id)).balance);
    MATCHING_CONFIG['MATCHING_SPEEDUP_PRICE_DIAMOND'] = 77;
    try {
      const recoveries = [
        new MatchingOperationRecoveryService(operationRepo, matchingService, configStub, schedulerStub),
        new MatchingOperationRecoveryService(operationRepo, matchingService, configStub, schedulerStub),
      ];
      const counts = await Promise.all(recoveries.map((recovery) => recovery.recoverOnce()));
      expect(counts.every((count) => count >= 1)).toBe(true);
    } finally {
      MATCHING_CONFIG['MATCHING_SPEEDUP_PRICE_DIAMOND'] = 50;
    }
    const after = BigInt((await economy.getWallet(user.id)).balance);
    expect(before - after).toBe(50n);
    const fresh = await ticketRepo.findOneByOrFail({ id: ticket.id });
    expect(fresh.priority).toBe(true);
    expect(fresh.priorityBoostMs).toBe(123_456);
  });

  it('compensation resume sau crash post-reversal không reverse hai lần', async () => {
    const user = await createUser({ gender: Gender.Male, region: 'R-COMP' });
    await economy.creditFromIap(
      user.id,
      IapProvider.Google,
      { devTransactionId: `comp-credit-${user.id}` },
      'com.litmatch.diamond.1200',
    );
    const ticket = await matchingService.createTicket(user.id, soulTicketDto('ignored'), 'comp-ticket');
    const operationRepo = ds.getRepository(MatchingOperation);
    const operation = await operationRepo.save(
      operationRepo.create({
        userId: user.id,
        ticketId: ticket.id,
        kind: MatchingOperationKind.Speedup,
        idempotencyKey: 'comp-operation',
        requestHash: 'c'.repeat(64),
        priceDiamond: '50',
        priorityBoostMs: 300_000,
        policyVersion: 1,
        status: MatchingOperationStatus.Pending,
        economyTransactionId: null,
        appliedAt: null,
      }),
    );
    const before = BigInt((await economy.getWallet(user.id)).balance);
    const charged = await economy.spendDiamond({
      userId: user.id,
      amount: 50n,
      type: TransactionType.MatchingSpeedup,
      idempotencyKey: `matching:speedup:operation:${operation.id}`,
      metadata: {
        version: 1,
        feature: 'matching_speedup',
        ticketId: ticket.id,
        priceDiamond: '50',
        priorityBoostMs: 300_000,
        policyVersion: 1,
      },
    });
    await operationRepo.update(
      { id: operation.id },
      { status: MatchingOperationStatus.Compensating, economyTransactionId: charged.transactionId },
    );
    await matchingService.cancelTicket(user.id, ticket.id);
    await economy.reverseTransaction(
      charged.transactionId,
      `matching:speedup:compensation:${operation.id}`,
      'ticket_not_queued_after_charge',
    );

    await expect(matchingService.resumeSpeedupOperation(operation.id)).rejects.toMatchObject({
      code: MatchingErrors.TICKET_NOT_QUEUED,
    });
    expect((await operationRepo.findOneByOrFail({ id: operation.id })).status).toBe(
      MatchingOperationStatus.Compensated,
    );
    expect(BigInt((await economy.getWallet(user.id)).balance)).toBe(before);
  });

  it('speed-up rate limit: vượt MATCHING_SPEEDUP_MAX_PER_HOUR → 429, không charge thêm', async () => {
    const user = await createUser({ gender: Gender.Male, region: 'R-LIMIT' });
    await economy.creditFromIap(user.id, IapProvider.Google, { devTransactionId: `speedup-limit-${user.id}` }, 'com.litmatch.diamond.1200');
    const maxPerHour = MATCHING_CONFIG['MATCHING_SPEEDUP_MAX_PER_HOUR'] as number;

    for (let i = 0; i < maxPerHour; i++) {
      const t = await matchingService.createTicket(user.id, soulTicketDto('R-LIMIT'), `limit-ticket-${i}`);
      await matchingService.applySpeedup(user.id, t.id, `limit-speedup-${i}`);
      await matchingService.cancelTicket(user.id, t.id); // rảnh chỗ cho ticket active tiếp theo
    }

    const extra = await matchingService.createTicket(user.id, soulTicketDto('R-LIMIT'), 'limit-ticket-extra');
    await expect(matchingService.applySpeedup(user.id, extra.id, 'limit-speedup-extra')).rejects.toMatchObject({
      code: MatchingErrors.SPEEDUP_RATE_LIMITED,
    });
  });

  it('sweeper: ticket queued quá hạn → expired + gỡ khỏi Redis shard', async () => {
    const user = await createUser({ gender: Gender.Male, region: 'R-SWQ' });
    const ticket = await matchingService.createTicket(user.id, soulTicketDto('R-SWQ'), 'sweep-queued');
    await projection.flushOnce();
    await ds.getRepository(MatchTicket).update({ id: ticket.id }, { expiresAt: new Date(Date.now() - 1000) });

    const result = await sweeper.sweepOnce();
    await projection.flushOnce();
    expect(result.expiredQueued).toBeGreaterThanOrEqual(1);

    const fresh = await ticketRepo.findOneByOrFail({ id: ticket.id });
    expect(fresh.status).toBe(MatchTicketStatus.Expired);
    const shardKey = queue.shardKey(fresh.matchType, fresh.region, queue.ageBand(fresh.ownAge));
    expect(await queue.cardinality(shardKey)).toBe(0);
  });

  it('sweeper: 1 phía confirm kịp, phía kia không confirm trong hạn → phía confirm được requeue lại, phía kia expired', async () => {
    const userA = await createUser({ gender: Gender.Male, region: 'R-SWCONF' });
    const userB = await createUser({ gender: Gender.Female, region: 'R-SWCONF' });
    const ticketA = await matchingService.createTicket(userA.id, soulTicketDto('R-SWCONF'), 'sweep-confirm-a');
    const ticketB = await matchingService.createTicket(userB.id, soulTicketDto('R-SWCONF'), 'sweep-confirm-b');
    await projection.flushOnce();
    await matcherWorker.tickOnce();

    await matchingService.confirmTicket(userA.id, ticketA.id); // A confirm kịp, B thì không
    await ds.getRepository(MatchTicket).update({ id: ticketA.id }, { expiresAt: new Date(Date.now() - 1000) });
    await ds.getRepository(MatchTicket).update({ id: ticketB.id }, { expiresAt: new Date(Date.now() - 1000) });

    const sweepers = [
      new TicketSweeperService(ticketRepo, ds, configStub, schedulerStub),
      new TicketSweeperService(ticketRepo, ds, configStub, schedulerStub),
    ];
    const results = await Promise.all(sweepers.map((worker) => worker.sweepOnce()));
    await projection.flushOnce();
    expect(results.reduce((sum, result) => sum + result.resolvedPairs, 0)).toBeGreaterThanOrEqual(1);

    const freshA = await ticketRepo.findOneByOrFail({ id: ticketA.id });
    const freshB = await ticketRepo.findOneByOrFail({ id: ticketB.id });
    expect(freshA.status).toBe(MatchTicketStatus.Queued); // đã làm đúng phần mình → không bị phạt, quay lại hàng đợi
    expect(freshA.pairedTicketId).toBeNull();
    expect(freshB.status).toBe(MatchTicketStatus.Expired); // không confirm kịp

    const shardKey = queue.shardKey(freshA.matchType, freshA.region, queue.ageBand(freshA.ownAge));
    expect(await queue.cardinality(shardKey)).toBeGreaterThanOrEqual(1);
  });

  it('full reconciliation rebuild queued projection sau Redis data loss mà không FLUSHDB toàn cục', async () => {
    const user = await createUser({ gender: Gender.Male, region: 'R-REBUILD' });
    const ticket = await matchingService.createTicket(user.id, soulTicketDto('ignored'), 'rebuild-ticket');
    await projection.flushOnce();
    await clearMatchingRedis();
    await projection.flushOnce(true);
    const fresh = await ticketRepo.findOneByOrFail({ id: ticket.id });
    const shard = queue.shardKey(fresh.matchType, fresh.region, queue.ageBand(fresh.ownAge));
    expect(await queue.cardinality(shard)).toBe(1);
  });
});
