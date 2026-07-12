import Redis from 'ioredis';
import { DataSource, In } from 'typeorm';

import { SnakeNamingStrategy } from '../../database/snake-naming.strategy';
import { InitAuthUser1751900000000 } from '../../database/migrations/1751900000000-init-auth-user';
import { EconomyLedger1752000000000 } from '../../database/migrations/1752000000000-economy-ledger';
import { EconomyRefund1752100000000 } from '../../database/migrations/1752100000000-economy-refund';
import { MatchingCore1752200000000 } from '../../database/migrations/1752200000000-matching-core';
import { AuthIdentity } from '../auth/entities/auth-identity.entity';
import { PhoneOtp } from '../auth/entities/phone-otp.entity';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { User, UserService, UserStatus } from '../user';
import { EconomyService } from '../economy/economy.service';
import { EconomyErrors } from '../economy/economy.errors';
import { LedgerService } from '../economy/services/ledger.service';
import { LedgerAccount } from '../economy/entities/ledger-account.entity';
import { LedgerEntry } from '../economy/entities/ledger-entry.entity';
import { OutboxEvent } from '../economy/entities/outbox-event.entity';
import { LedgerTransaction } from '../economy/entities/transaction.entity';
import { Wallet } from '../economy/entities/wallet.entity';
import { IapProduct, IapProvider, IapReceipt } from '../economy/entities/iap.entities';
import { VipPlan } from '../economy/entities/vip-plan.entity';

import { MatchingService } from './matching.service';
import { MatchingErrors } from './matching.errors';
import { MatcherWorkerService } from './jobs/matcher-worker.service';
import { TicketSweeperService } from './jobs/ticket-sweeper.service';
import { MatchTicket, MatchTicketStatus, MatchType } from './entities/match-ticket.entity';
import { MatchSession, MatchSessionStatus } from './entities/match-session.entity';
import { MATCHING_ACTIVE_SHARDS_KEY, matchingShardKey } from './redis/matching-redis.provider';

import type { ConfigService } from '@nestjs/config';
import type { SchedulerRegistry } from '@nestjs/schedule';

import type { CoreApiEnv } from '../../config/env.validation';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import type { MatchInteractionPolicy } from './ports/interaction-policy';
import type { IapVerifier } from '../economy/ports/iap-verifier';

/**
 * Integration test Matching trên Postgres + Redis thật (docs/05 § 5.9 — race 2 matcher,
 * verify-lại-lúc-ghép, speedup vượt rate-limit không trừ tiền quá giới hạn).
 *
 * LƯU Ý DB: KHÔNG dùng chung database với economy.integration.spec.ts — cả 2 suite đều
 * dropSchema:true và Jest chạy chúng ở worker song song, dùng chung DB sẽ drop schema
 * giữa lúc suite kia đang chạy. DB của suite này = `<tên gốc>_matching`.
 * Redis: dùng logical db riêng (db 15) + flush trước mỗi test — không đụng dev state ở db 0.
 */
const INTEGRATION_DB_URL = process.env['INTEGRATION_DB_URL'];
const d = INTEGRATION_DB_URL ? describe : describe.skip;
if (!INTEGRATION_DB_URL) {
  // eslint-disable-next-line no-console
  console.warn('[matching.integration] BỎ QUA — set INTEGRATION_DB_URL để chạy bộ test race trên Postgres thật');
}

jest.setTimeout(60_000);

const CONFIG: Record<string, unknown> = {
  MATCHING_MATCHER_INTERVAL_MS: 300,
  MATCHING_MATCHER_BATCH_SIZE: 20,
  MATCHING_SWEEPER_INTERVAL_MS: 5000,
  // timeout đặt RẤT lớn để ticket/session của các test trước (cùng DB) không "tự già" khi suite chạy chậm;
  // test sweeper chủ động backdate 2 giờ vào quá khứ thay vì ngồi chờ thật
  MATCHING_QUEUE_MAX_WAIT_SECONDS: 3600,
  MATCHING_CONFIRM_TIMEOUT_SECONDS: 3600,
  MATCHING_AGE_BAND_SIZE: 5,
  MATCHING_SPEEDUP_PRICE_DIAMOND: 50,
  MATCHING_SPEEDUP_MAX_PER_HOUR: 3,
  MATCHING_PRIORITY_BOOST_MS: 300_000,
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

d('Matching integration (Postgres + Redis thật)', () => {
  let ds: DataSource;
  let redis: Redis;
  let matching: MatchingService;
  let economy: EconomyService;
  let worker: MatcherWorkerService;
  let workerB: MatcherWorkerService; // instance thứ 2 — giả lập 2 pod matcher song song
  let sweeper: TicketSweeperService;
  /** Policy stub thay cho Safety module (chưa tồn tại ở M1) — set để giả lập block SAU khi enqueue. */
  const blockedPairs = new Set<string>();
  const policyStub: MatchInteractionPolicy = {
    canPair: async (a, b) => !blockedPairs.has(`${a}|${b}`) && !blockedPairs.has(`${b}|${a}`),
  };

  const auth = (userId: string): AuthenticatedUser => ({ userId, isGuest: false });

  async function createUser(nickname: string, opts: { region?: string | null; birthDate?: string | null } = {}): Promise<User> {
    const repo = ds.getRepository(User);
    return repo.save(
      repo.create({
        nickname,
        avatarId: 'default-01',
        isGuest: false,
        region: opts.region === undefined ? 'VN' : opts.region,
        birthDate: opts.birthDate === undefined ? '2000-01-01' : opts.birthDate,
      }),
    );
  }

  async function fund(userId: string, product = 'com.litmatch.diamond.1200'): Promise<void> {
    await economy.creditFromIap(userId, IapProvider.Google, { devTransactionId: `fund-${userId}-${Date.now()}` }, product);
  }

  beforeAll(async () => {
    // DB RIÊNG cho matching: đổi tên database của INTEGRATION_DB_URL thành `<tên gốc>_matching`
    // (tránh đụng độ dropSchema với economy.integration.spec.ts chạy ở Jest worker khác)
    const url = new URL(INTEGRATION_DB_URL as string);
    const dbName = `${url.pathname.slice(1)}_matching`;
    url.pathname = `/${dbName}`;
    const matchingDbUrl = url.toString();

    const adminUrl = new URL(INTEGRATION_DB_URL as string);
    adminUrl.pathname = '/postgres';
    const admin = new DataSource({ type: 'postgres', url: adminUrl.toString() });
    await admin.initialize();
    const exists = await admin.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [dbName]);
    if (exists.length === 0) await admin.query(`CREATE DATABASE "${dbName}"`);
    await admin.destroy();

    ds = new DataSource({
      type: 'postgres',
      url: matchingDbUrl,
      entities: [
        User, AuthIdentity, RefreshToken, PhoneOtp,
        LedgerAccount, LedgerTransaction, LedgerEntry, Wallet, IapProduct, IapReceipt, VipPlan, OutboxEvent,
        MatchTicket, MatchSession,
      ],
      migrations: [
        InitAuthUser1751900000000,
        EconomyLedger1752000000000,
        EconomyRefund1752100000000,
        MatchingCore1752200000000,
      ],
      namingStrategy: new SnakeNamingStrategy(),
      synchronize: false,
      dropSchema: true, // DB test riêng — làm sạch mỗi lần chạy
    });
    await ds.initialize();
    await ds.runMigrations();

    redis = new Redis(process.env['REDIS_URL'] ?? 'redis://localhost:6379', { db: 15 });

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
    const userService = new UserService(ds.getRepository(User), configStub);
    matching = new MatchingService(ds, ds.getRepository(MatchTicket), userService, economy, configStub, redis);
    worker = new MatcherWorkerService(ds, configStub, schedulerStub, redis, policyStub);
    workerB = new MatcherWorkerService(ds, configStub, schedulerStub, redis, policyStub);
    sweeper = new TicketSweeperService(ds, configStub, schedulerStub, redis);
  });

  beforeEach(async () => {
    blockedPairs.clear();
    await redis.flushdb(); // chỉ db 15 của suite này
  });

  afterAll(async () => {
    await redis?.quit();
    await ds?.destroy();
  });

  it('joinQueue: ticket vào DB + Redis đúng shard; partial unique index chặn ticket active thứ 2 ở tầng DB', async () => {
    const u = await createUser('join-1');
    const ticket = await matching.joinQueue(auth(u.id), { matchType: MatchType.Voice }, 'key-1');
    expect(ticket.status).toBe(MatchTicketStatus.Queued);
    expect(ticket.region).toBe('VN');

    const shard = matchingShardKey(MatchType.Voice, 'VN', ticket.ageBand);
    expect(await redis.zscore(shard, ticket.id)).toBe(String(ticket.enqueuedAt.getTime()));
    expect(await redis.sismember(MATCHING_ACTIVE_SHARDS_KEY, shard)).toBe(1);

    // API lần 2 (key khác) → 409 nghiệp vụ
    await expect(matching.joinQueue(auth(u.id), { matchType: MatchType.Voice }, 'key-2')).rejects.toMatchObject({
      code: MatchingErrors.TICKET_ALREADY_QUEUED,
    });
    // retry cùng key → replay đúng ticket cũ, không tạo mới
    const replay = await matching.joinQueue(auth(u.id), { matchType: MatchType.Voice }, 'key-1');
    expect(replay.id).toBe(ticket.id);
    expect(await ds.getRepository(MatchTicket).countBy({ userId: u.id })).toBe(1);

    // chốt chặn DB thật: INSERT thẳng (bypass service) ticket active thứ 2 → 23505
    await expect(
      ds.query(
        `INSERT INTO match_tickets (user_id, match_type, region, age_band, status, enqueued_at, idempotency_key)
         VALUES ($1, 'voice', 'VN', 5, 'queued', now(), 'bypass-key')`,
        [u.id],
      ),
    ).rejects.toMatchObject({ driverError: expect.objectContaining({ code: '23505' }) });
  });

  it('2 matcher tick chạy đồng thời trên cùng shard → 2 ticket chỉ được ghép ĐÚNG 1 lần (ZPOPMIN atomic + verify DB)', async () => {
    const u1 = await createUser('race-1');
    const u2 = await createUser('race-2');
    const t1 = await matching.joinQueue(auth(u1.id), { matchType: MatchType.Voice }, 'k');
    const t2 = await matching.joinQueue(auth(u2.id), { matchType: MatchType.Voice }, 'k');

    // 2 instance matcher (2 "pod") tick song song — không được tạo 2 session / match đôi
    const [m1, m2] = await Promise.all([worker.runOnce(), workerB.runOnce()]);
    expect(m1 + m2).toBe(1);

    const sessions = await ds.getRepository(MatchSession).find();
    expect(sessions.length).toBe(1);
    expect(sessions[0].status).toBe(MatchSessionStatus.PendingConfirm);
    expect([sessions[0].ticketAId, sessions[0].ticketBId].sort()).toEqual([t1.id, t2.id].sort());

    for (const id of [t1.id, t2.id]) {
      const fresh = await ds.getRepository(MatchTicket).findOneByOrFail({ id });
      expect(fresh.status).toBe(MatchTicketStatus.Matched);
      expect(fresh.sessionId).toBe(sessions[0].id);
    }
    // queue đã rỗng — tick tiếp không ghép thêm gì
    expect(await worker.runOnce()).toBe(0);
  });

  it('block SAU khi enqueue, TRƯỚC khi ghép → không được ghép (verify-lại-lúc-ghép, docs/10 § 10.0.C)', async () => {
    const u1 = await createUser('block-1');
    const u2 = await createUser('block-2');
    await matching.joinQueue(auth(u1.id), { matchType: MatchType.Voice }, 'k');
    await matching.joinQueue(auth(u2.id), { matchType: MatchType.Voice }, 'k');

    blockedPairs.add(`${u1.id}|${u2.id}`); // block xảy ra khi cả 2 ĐÃ nằm trong queue

    expect(await worker.runOnce()).toBe(0);

    // cả 2 vẫn hợp lệ → không được ghép (không sessionId), trả lại queue với score gốc, không mất lượt chờ
    const tickets = await ds.getRepository(MatchTicket).findBy({ userId: In([u1.id, u2.id]) });
    expect(tickets.length).toBe(2);
    const shard = matchingShardKey(MatchType.Voice, 'VN', tickets[0].ageBand);
    for (const t of tickets) {
      expect(t.status).toBe(MatchTicketStatus.Queued);
      expect(t.sessionId).toBeNull();
      expect(await redis.zscore(shard, t.id)).toBe(String(t.enqueuedAt.getTime()));
    }

    // bỏ block → tick sau ghép bình thường (block chỉ chặn đúng thời điểm còn hiệu lực)
    blockedPairs.clear();
    expect(await worker.runOnce()).toBe(1);
  });

  it('ticket cancelled/banned sau enqueue (zombie Redis) → matcher loại đúng, partner giữ nguyên priority gốc', async () => {
    const u1 = await createUser('zombie-1');
    const u2 = await createUser('zombie-2');
    const t1 = await matching.joinQueue(auth(u1.id), { matchType: MatchType.Voice }, 'k');
    const t2 = await matching.joinQueue(auth(u2.id), { matchType: MatchType.Voice }, 'k');

    // giả lập crash giữa "DB cancel" và "ZREM Redis": đổi trạng thái thẳng trong DB, để nguyên Redis
    await ds.query(`UPDATE match_tickets SET status = 'cancelled' WHERE id = $1`, [t1.id]);

    expect(await worker.runOnce()).toBe(0);

    const shard = matchingShardKey(MatchType.Voice, 'VN', t1.ageBand);
    // ticket cancelled: không bị đổi trạng thái (đã rời queue hợp lệ), không được ghép, không còn trong Redis
    expect((await ds.getRepository(MatchTicket).findOneByOrFail({ id: t1.id })).status).toBe(MatchTicketStatus.Cancelled);
    expect((await ds.getRepository(MatchTicket).findOneByOrFail({ id: t2.id })).sessionId).toBeNull();
    expect(await redis.zscore(shard, t1.id)).toBeNull();
    // partner còn hợp lệ: vẫn queued, score gốc (không mất lượt chờ)
    expect((await ds.getRepository(MatchTicket).findOneByOrFail({ id: t2.id })).status).toBe(MatchTicketStatus.Queued);
    expect(await redis.zscore(shard, t2.id)).toBe(String(t2.enqueuedAt.getTime()));

    // user bị BAN sau khi enqueue → verify-lại-lúc-ghép expire ticket đó (queued→expired)
    const u3 = await createUser('zombie-3');
    const t3 = await matching.joinQueue(auth(u3.id), { matchType: MatchType.Voice }, 'k');
    await ds.getRepository(User).update({ id: u3.id }, { status: UserStatus.Banned });

    expect(await worker.runOnce()).toBe(0);
    expect((await ds.getRepository(MatchTicket).findOneByOrFail({ id: t3.id })).status).toBe(MatchTicketStatus.Expired);
    expect((await ds.getRepository(MatchTicket).findOneByOrFail({ id: t2.id })).status).toBe(MatchTicketStatus.Queued);
  });

  it('confirm 2 chiều: cả 2 confirm → session + 2 ticket confirmed; confirm ticket người khác → 403', async () => {
    const u1 = await createUser('confirm-1');
    const u2 = await createUser('confirm-2');
    const t1 = await matching.joinQueue(auth(u1.id), { matchType: MatchType.Soul }, 'k');
    const t2 = await matching.joinQueue(auth(u2.id), { matchType: MatchType.Soul }, 'k');
    expect(await worker.runOnce()).toBe(1);

    // IDOR: u2 confirm hộ ticket của u1 → 403
    await expect(matching.confirmTicket(auth(u2.id), t1.id)).rejects.toMatchObject({
      code: MatchingErrors.TICKET_FORBIDDEN,
    });

    const afterFirst = await matching.confirmTicket(auth(u1.id), t1.id);
    expect(afterFirst.status).toBe(MatchTicketStatus.Matched); // mới 1 bên — chưa chốt

    const afterSecond = await matching.confirmTicket(auth(u2.id), t2.id);
    expect(afterSecond.status).toBe(MatchTicketStatus.Confirmed);

    const session = await ds.getRepository(MatchSession).findOneByOrFail({ id: afterSecond.sessionId as string });
    expect(session.status).toBe(MatchSessionStatus.Confirmed);
    expect((await ds.getRepository(MatchTicket).findOneByOrFail({ id: t1.id })).status).toBe(MatchTicketStatus.Confirmed);
  });

  it('speedup: N request song song vượt MATCHING_SPEEDUP_MAX_PER_HOUR → đúng số bị chặn 409, KHÔNG trừ tiền quá giới hạn', async () => {
    const u = await createUser('speedup-1');
    await fund(u.id); // 1200 diamond
    const t = await matching.joinQueue(auth(u.id), { matchType: MatchType.Voice }, 'k');
    const before = BigInt((await economy.getWallet(u.id)).balance);

    // 6 request song song, key KHÁC nhau, max 3/giờ → đúng 3 thành công, 3 bị 409
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, (_, i) => matching.speedup(auth(u.id), t.id, `sp-${i}`)),
    );
    const ok = results.filter((r) => r.status === 'fulfilled');
    const limited = results.filter(
      (r) => r.status === 'rejected' && (r.reason as { code?: string }).code === MatchingErrors.SPEEDUP_RATE_LIMITED,
    );
    expect(ok.length).toBe(3);
    expect(limited.length).toBe(3);

    // tiền trừ đúng 3 × 50, không hơn (docs/10 § Matching — speed-up phải có giới hạn)
    const after = BigInt((await economy.getWallet(u.id)).balance);
    expect(before - after).toBe(150n);

    // boost thực sự được thực thi: score Redis = enqueuedAtMs - 3 × boost (trả tiền là được ưu tiên thật)
    const fresh = await ds.getRepository(MatchTicket).findOneByOrFail({ id: t.id });
    expect(fresh.priorityBoostMs).toBe(3 * 300_000);
    const shard = matchingShardKey(MatchType.Voice, 'VN', t.ageBand);
    expect(await redis.zscore(shard, t.id)).toBe(String(fresh.enqueuedAt.getTime() - 3 * 300_000));

    // retry cùng key đã dùng → replay, không trừ tiền thêm, không boost thêm
    const replay = await matching.speedup(auth(u.id), t.id, 'sp-0');
    expect(replay.replayed).toBe(true);
    expect(BigInt((await economy.getWallet(u.id)).balance)).toBe(after);
    expect((await ds.getRepository(MatchTicket).findOneByOrFail({ id: t.id })).priorityBoostMs).toBe(3 * 300_000);
  });

  it('speedup không đủ diamond → lỗi Economy, slot rate-limit được hoàn lại (không mất lượt oan)', async () => {
    const u = await createUser('speedup-poor');
    const t = await matching.joinQueue(auth(u.id), { matchType: MatchType.Voice }, 'k');
    await expect(matching.speedup(auth(u.id), t.id, 'sp-1')).rejects.toMatchObject({
      code: EconomyErrors.WALLET_INSUFFICIENT_BALANCE,
    });
    // slot đã hoàn — nạp tiền rồi vẫn speedup được đủ 3 lần
    await fund(u.id);
    for (let i = 0; i < 3; i++) {
      await matching.speedup(auth(u.id), t.id, `sp-after-${i}`);
    }
    expect((await ds.getRepository(MatchTicket).findOneByOrFail({ id: t.id })).priorityBoostMs).toBe(3 * 300_000);
  });

  it('speedup ưu tiên thật trong ghép cặp: ticket boost được ghép trước ticket vào sớm hơn', async () => {
    const users = await Promise.all([createUser('prio-1'), createUser('prio-2'), createUser('prio-3')]);
    const tickets: MatchTicket[] = [];
    for (const u of users) {
      tickets.push(await matching.joinQueue(auth(u.id), { matchType: MatchType.Voice }, 'k'));
    }
    // user thứ 3 (vào sau cùng) mua speed-up → phải nổi lên đầu hàng đợi
    await fund(users[2].id);
    await matching.speedup(auth(users[2].id), tickets[2].id, 'sp');

    expect(await worker.runOnce()).toBe(1); // chỉ đủ 1 cặp, người còn lại chờ tiếp
    const boosted = await ds.getRepository(MatchTicket).findOneByOrFail({ id: tickets[2].id });
    const session = await ds.getRepository(MatchSession).findOneByOrFail({ id: boosted.sessionId as string });
    const matchedTickets = [session.ticketAId, session.ticketBId];
    // cặp được ghép phải chứa ticket đã boost (score thấp nhất) + ticket sớm nhất còn lại
    expect(matchedTickets).toContain(tickets[2].id);
    expect(matchedTickets).toContain(tickets[0].id);
    expect((await ds.getRepository(MatchTicket).findOneByOrFail({ id: tickets[1].id })).status).toBe(
      MatchTicketStatus.Queued,
    );
  });

  it('sweeper: queued quá hạn → expired + rời Redis; matched quá hạn confirm → bên confirm được requeue ticket MỚI, bên im lặng expired', async () => {
    // --- queued quá hạn ---
    const u1 = await createUser('sweep-1');
    const t1 = await matching.joinQueue(auth(u1.id), { matchType: MatchType.Voice }, 'k');
    await ds.query(`UPDATE match_tickets SET enqueued_at = now() - interval '2 hours' WHERE id = $1`, [t1.id]);

    const swept = await sweeper.runOnce();
    expect(swept.expiredQueued).toBe(1);
    expect((await ds.getRepository(MatchTicket).findOneByOrFail({ id: t1.id })).status).toBe(MatchTicketStatus.Expired);
    const shard = matchingShardKey(MatchType.Voice, 'VN', t1.ageBand);
    expect(await redis.zscore(shard, t1.id)).toBeNull();

    // --- matched quá hạn confirm: u2 đã confirm, u3 im lặng ---
    const u2 = await createUser('sweep-2');
    const u3 = await createUser('sweep-3');
    const t2 = await matching.joinQueue(auth(u2.id), { matchType: MatchType.Voice }, 'k');
    const t3 = await matching.joinQueue(auth(u3.id), { matchType: MatchType.Voice }, 'k');
    expect(await worker.runOnce()).toBe(1);
    await matching.confirmTicket(auth(u2.id), t2.id);
    const sessionId = (await ds.getRepository(MatchTicket).findOneByOrFail({ id: t2.id })).sessionId as string;
    // chỉ backdate đúng session này — các test trước có thể còn session pending khác trong cùng DB
    await ds.query(`UPDATE match_sessions SET created_at = now() - interval '2 hours' WHERE id = $1`, [sessionId]);

    const swept2 = await sweeper.runOnce();
    expect(swept2.expiredSessions).toBe(1);

    const session = await ds.getRepository(MatchSession).findOneByOrFail({ id: sessionId });
    expect(session.status).toBe(MatchSessionStatus.Expired);
    // bên im lặng: expired, không được requeue
    expect((await ds.getRepository(MatchTicket).findOneByOrFail({ id: t3.id })).status).toBe(MatchTicketStatus.Expired);
    expect(await ds.getRepository(MatchTicket).countBy({ userId: u3.id })).toBe(1);
    // bên đã confirm: ticket cũ expired + ticket MỚI queued (enqueue mới — spec § 3), có mặt trong Redis
    expect((await ds.getRepository(MatchTicket).findOneByOrFail({ id: t2.id })).status).toBe(MatchTicketStatus.Expired);
    const requeued = await ds.getRepository(MatchTicket).findOneByOrFail({ userId: u2.id, status: MatchTicketStatus.Queued });
    expect(requeued.id).not.toBe(t2.id);
    expect(await redis.zscore(shard, requeued.id)).toBe(String(requeued.enqueuedAt.getTime()));

    // sweeper chạy lại → idempotent, không requeue đôi (idempotency key tất định theo session+ticket)
    const swept3 = await sweeper.runOnce();
    expect(swept3.expiredSessions).toBe(0);
    expect(await ds.getRepository(MatchTicket).countBy({ userId: u2.id, status: MatchTicketStatus.Queued })).toBe(1);

    // confirm muộn sau khi ticket đã expired → 409 (xác minh lại tại thời điểm hành động, docs/10 § 10.0.C)
    await expect(matching.confirmTicket(auth(u3.id), t3.id)).rejects.toMatchObject({
      code: MatchingErrors.TICKET_INVALID_TRANSITION,
    });
  });
});
