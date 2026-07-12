import { DomainException } from '@litmatch/common-exceptions';

import { MatchingService } from './matching.service';
import { MatchingErrors } from './matching.errors';
import {
  GenderPreference,
  MatchTicket,
  MatchTicketStatus,
  MatchType,
} from './entities/match-ticket.entity';
import { TransactionType } from '../economy';
import { UserStatus } from '../user';

import type { ConfigService } from '@nestjs/config';
import type { DataSource, EntityManager, Repository } from 'typeorm';
import type Redis from 'ioredis';

import type { CoreApiEnv } from '../../config/env.validation';
import type { EconomyService } from '../economy';
import type { User, UserService } from '../user';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

const CONFIG: Record<string, unknown> = {
  MATCHING_AGE_BAND_SIZE: 5,
  MATCHING_SPEEDUP_PRICE_DIAMOND: 50,
  MATCHING_SPEEDUP_MAX_PER_HOUR: 3,
  MATCHING_PRIORITY_BOOST_MS: 300_000,
};

const me: AuthenticatedUser = { userId: 'user-me', isGuest: false };

function makeTicket(overrides: Partial<MatchTicket> = {}): MatchTicket {
  return Object.assign(new MatchTicket(), {
    id: 'ticket-1',
    userId: me.userId,
    matchType: MatchType.Voice,
    region: 'VN',
    ageBand: 5,
    genderPreference: GenderPreference.Any,
    status: MatchTicketStatus.Queued,
    enqueuedAt: new Date('2026-07-12T00:00:00Z'),
    priorityBoostMs: 0,
    sessionId: null,
    idempotencyKey: 'matching:join:user-me:k1',
    createdAt: new Date('2026-07-12T00:00:00Z'),
    updatedAt: new Date('2026-07-12T00:00:00Z'),
    ...overrides,
  });
}

describe('MatchingService (unit — mock repo/redis/economy)', () => {
  let ticketRepo: jest.Mocked<
    Pick<
      Repository<MatchTicket>,
      'save' | 'create' | 'findOneBy' | 'findOneByOrFail' | 'increment'
    >
  >;
  let redis: {
    eval: jest.Mock;
    zadd: jest.Mock;
    zrem: jest.Mock;
    sadd: jest.Mock;
    decr: jest.Mock;
  };
  let economy: { spendDiamond: jest.Mock; hasTransaction: jest.Mock };
  let userService: { getByIdOrThrow: jest.Mock };
  let manager: jest.Mocked<Pick<EntityManager, 'findOne' | 'save'>>;
  let dataSource: { transaction: jest.Mock };
  let service: MatchingService;

  beforeEach(() => {
    ticketRepo = {
      save: jest.fn(async (t) => t as MatchTicket),
      create: jest.fn((input) => Object.assign(new MatchTicket(), input)),
      findOneBy: jest.fn(),
      findOneByOrFail: jest.fn(),
      increment: jest.fn(async () => ({
        affected: 1,
        raw: [],
        generatedMaps: [],
      })),
    } as never;
    redis = {
      eval: jest.fn(async () => 1),
      zadd: jest.fn(async () => 1),
      zrem: jest.fn(async () => 1),
      sadd: jest.fn(async () => 1),
      decr: jest.fn(async () => 0),
    };
    economy = {
      spendDiamond: jest.fn(async () => ({
        transactionId: 'txn-1',
        replayed: false,
      })),
      hasTransaction: jest.fn(async () => false),
    };
    userService = {
      getByIdOrThrow: jest.fn(
        async () =>
          ({
            id: me.userId,
            status: UserStatus.Active,
            region: 'VN',
            birthDate: '2000-01-01',
          }) as User,
      ),
    };
    manager = { findOne: jest.fn(), save: jest.fn(async (t) => t) } as never;
    dataSource = {
      transaction: jest.fn(async (cb: (m: EntityManager) => Promise<unknown>) =>
        cb(manager as never),
      ),
    };

    const config = {
      getOrThrow: (key: string) => {
        if (!(key in CONFIG)) throw new Error(`missing config ${key}`);
        return CONFIG[key];
      },
    } as unknown as ConfigService<CoreApiEnv, true>;

    service = new MatchingService(
      dataSource as unknown as DataSource,
      ticketRepo as unknown as Repository<MatchTicket>,
      userService as unknown as UserService,
      economy as unknown as EconomyService,
      config,
      redis as unknown as Redis,
    );
  });

  describe('joinQueue', () => {
    it('derive region + ageBand từ profile server-side, KHÔNG nhận từ client (docs/10 § 10.0.B)', async () => {
      const ticket = await service.joinQueue(
        me,
        { matchType: MatchType.Voice },
        'k1',
      );
      expect(ticket.region).toBe('VN'); // từ profile, client không gửi được
      expect(ticket.ageBand).toBe(Math.floor(26 / 5)); // sinh 2000-01-01, hôm nay 2026-07 → 26 tuổi
      expect(redis.zadd).toHaveBeenCalledWith(
        'matching:queue:voice:VN:5',
        'NX',
        String(ticket.enqueuedAt.getTime()),
        ticket.id,
      );
      expect(redis.sadd).toHaveBeenCalledWith(
        'matching:shards:active',
        'matching:queue:voice:VN:5',
      );
    });

    it('profile thiếu region/birthDate → shard GLOBAL + ageBand -1 (không chặn, không đoán)', async () => {
      userService.getByIdOrThrow.mockResolvedValue({
        id: me.userId,
        status: UserStatus.Active,
        region: null,
        birthDate: null,
      } as never);
      const ticket = await service.joinQueue(
        me,
        { matchType: MatchType.Soul },
        'k1',
      );
      expect(ticket.region).toBe('GLOBAL');
      expect(ticket.ageBand).toBe(-1);
    });

    it('user bị ban → MATCHING_USER_BANNED 403, không tạo ticket', async () => {
      userService.getByIdOrThrow.mockResolvedValue({
        id: me.userId,
        status: UserStatus.Banned,
        region: 'VN',
        birthDate: null,
      } as never);
      await expect(
        service.joinQueue(me, { matchType: MatchType.Voice }, 'k1'),
      ).rejects.toMatchObject({
        code: MatchingErrors.USER_BANNED,
      });
      expect(ticketRepo.save).not.toHaveBeenCalled();
    });

    it('retry cùng Idempotency-Key → trả lại ticket cũ + re-enqueue NX, không tạo ticket đôi', async () => {
      const existing = makeTicket();
      ticketRepo.save.mockRejectedValueOnce({
        code: '23505',
        message: 'uq_match_tickets_idempotency_key',
      });
      ticketRepo.findOneBy.mockResolvedValueOnce(existing);

      const ticket = await service.joinQueue(
        me,
        { matchType: MatchType.Voice },
        'k1',
      );
      expect(ticket).toBe(existing);
      expect(redis.zadd).toHaveBeenCalledWith(
        expect.any(String),
        'NX',
        expect.any(String),
        existing.id,
      );
    });

    it('không gửi genderPreference → default any (client cũ giữ nguyên hành vi, docs/01 #13)', async () => {
      const ticket = await service.joinQueue(
        me,
        { matchType: MatchType.Voice },
        'k1',
      );
      expect(ticket.genderPreference).toBe(GenderPreference.Any);
    });

    it('gửi genderPreference → snapshot đúng lên ticket', async () => {
      const ticket = await service.joinQueue(
        me,
        {
          matchType: MatchType.Voice,
          genderPreference: GenderPreference.Female,
        },
        'k1',
      );
      expect(ticket.genderPreference).toBe(GenderPreference.Female);
    });

    it('cùng key nhưng genderPreference đổi → 409 IDEMPOTENCY_CONFLICT (request khác nội dung)', async () => {
      ticketRepo.save.mockRejectedValueOnce({
        code: '23505',
        message: 'uq_match_tickets_idempotency_key',
      });
      ticketRepo.findOneBy.mockResolvedValueOnce(makeTicket()); // ticket cũ pref = any
      await expect(
        service.joinQueue(
          me,
          {
            matchType: MatchType.Voice,
            genderPreference: GenderPreference.Male,
          },
          'k1',
        ),
      ).rejects.toMatchObject({
        code: MatchingErrors.TICKET_IDEMPOTENCY_CONFLICT,
      });
    });

    it('cùng key nhưng nội dung khác (matchType đổi) → 409 IDEMPOTENCY_CONFLICT (docs/05 § 5.10)', async () => {
      ticketRepo.save.mockRejectedValueOnce({
        code: '23505',
        message: 'uq_match_tickets_idempotency_key',
      });
      ticketRepo.findOneBy.mockResolvedValueOnce(
        makeTicket({ matchType: MatchType.Soul }),
      );
      await expect(
        service.joinQueue(me, { matchType: MatchType.Voice }, 'k1'),
      ).rejects.toMatchObject({
        code: MatchingErrors.TICKET_IDEMPOTENCY_CONFLICT,
      });
    });

    it('đã có ticket active (partial unique index bắn 23505) → 409 ALREADY_QUEUED', async () => {
      ticketRepo.save.mockRejectedValueOnce({
        code: '23505',
        message: 'uq_match_tickets_active_user',
      });
      ticketRepo.findOneBy.mockResolvedValueOnce(null); // không phải replay
      await expect(
        service.joinQueue(me, { matchType: MatchType.Voice }, 'k-khac'),
      ).rejects.toMatchObject({
        code: MatchingErrors.TICKET_ALREADY_QUEUED,
      });
    });
  });

  describe('ownership / IDOR (docs/10 § 10.1.D)', () => {
    it('getTicket của user khác → 403 FORBIDDEN', async () => {
      ticketRepo.findOneBy.mockResolvedValueOnce(
        makeTicket({ userId: 'user-khac' }),
      );
      await expect(service.getTicket(me, 'ticket-1')).rejects.toMatchObject({
        code: MatchingErrors.TICKET_FORBIDDEN,
      });
    });

    it('getTicket không tồn tại → 404', async () => {
      ticketRepo.findOneBy.mockResolvedValueOnce(null);
      await expect(service.getTicket(me, 'ticket-x')).rejects.toMatchObject({
        code: MatchingErrors.TICKET_NOT_FOUND,
      });
    });

    it('cancelTicket của user khác → 403, không đổi trạng thái', async () => {
      manager.findOne.mockResolvedValueOnce(
        makeTicket({ userId: 'user-khac' }),
      );
      await expect(service.cancelTicket(me, 'ticket-1')).rejects.toMatchObject({
        code: MatchingErrors.TICKET_FORBIDDEN,
      });
      expect(manager.save).not.toHaveBeenCalled();
    });
  });

  describe('state machine (spec § 1) — không tin client gửi trạng thái đích', () => {
    it.each([
      MatchTicketStatus.Matched,
      MatchTicketStatus.Confirmed,
      MatchTicketStatus.Expired,
      MatchTicketStatus.Cancelled,
    ])('cancel khi ticket đang %s → 409 INVALID_TRANSITION', async (status) => {
      manager.findOne.mockResolvedValueOnce(makeTicket({ status }));
      await expect(service.cancelTicket(me, 'ticket-1')).rejects.toMatchObject({
        code: MatchingErrors.TICKET_INVALID_TRANSITION,
      });
    });

    it('confirm khi ticket còn queued (chưa được ghép) → 409 INVALID_TRANSITION', async () => {
      ticketRepo.findOneBy.mockResolvedValueOnce(
        makeTicket({ status: MatchTicketStatus.Queued }),
      );
      await expect(service.confirmTicket(me, 'ticket-1')).rejects.toMatchObject(
        {
          code: MatchingErrors.TICKET_INVALID_TRANSITION,
        },
      );
    });

    it('cancel hợp lệ: queued→cancelled + ZREM khỏi shard', async () => {
      manager.findOne.mockResolvedValueOnce(makeTicket());
      const cancelled = await service.cancelTicket(me, 'ticket-1');
      expect(cancelled.status).toBe(MatchTicketStatus.Cancelled);
      expect(redis.zrem).toHaveBeenCalledWith(
        'matching:queue:voice:VN:5',
        'ticket-1',
      );
    });
  });

  describe('speedup (spec § 4)', () => {
    beforeEach(() => {
      ticketRepo.findOneBy.mockResolvedValue(makeTicket());
      ticketRepo.findOneByOrFail.mockResolvedValue(
        makeTicket({ priorityBoostMs: 300_000 }),
      );
    });

    it('rate-limit vượt giới hạn → 409 RATE_LIMITED và KHÔNG gọi spendDiamond (chặn trước khi trừ tiền)', async () => {
      redis.eval.mockResolvedValueOnce(-1);
      await expect(
        service.speedup(me, 'ticket-1', 'sk1'),
      ).rejects.toMatchObject({
        code: MatchingErrors.SPEEDUP_RATE_LIMITED,
      });
      expect(economy.spendDiamond).not.toHaveBeenCalled();
    });

    it('happy path: rate-limit TRƯỚC spendDiamond, rồi boost DB + ZADD XX score tuyệt đối', async () => {
      const callOrder: string[] = [];
      redis.eval.mockImplementationOnce(async () => {
        callOrder.push('rate-limit');
        return 1;
      });
      economy.spendDiamond.mockImplementationOnce(async () => {
        callOrder.push('spend');
        return { transactionId: 'txn-1', replayed: false };
      });

      const result = await service.speedup(me, 'ticket-1', 'sk1');
      expect(callOrder).toEqual(['rate-limit', 'spend']);
      expect(economy.spendDiamond).toHaveBeenCalledWith(
        me.userId,
        TransactionType.MatchingSpeedup,
        50,
        `matching:speedup:${me.userId}:sk1`,
        { ticketId: 'ticket-1' },
      );
      expect(ticketRepo.increment).toHaveBeenCalledWith(
        { id: 'ticket-1', status: MatchTicketStatus.Queued },
        'priorityBoostMs',
        300_000,
      );
      // score tuyệt đối = enqueuedAtMs - tổng boost trong DB (không ZINCRBY tương đối)
      const expectedScore =
        new Date('2026-07-12T00:00:00Z').getTime() - 300_000;
      expect(redis.zadd).toHaveBeenCalledWith(
        'matching:queue:voice:VN:5',
        'XX',
        String(expectedScore),
        'ticket-1',
      );
      expect(result.replayed).toBe(false);
    });

    it('replay cùng key → KHÔNG cộng boost lần 2, hoàn lại slot rate-limit (docs/10 § 10.0.D)', async () => {
      economy.spendDiamond.mockResolvedValueOnce({
        transactionId: 'txn-1',
        replayed: true,
      });
      const result = await service.speedup(me, 'ticket-1', 'sk1');
      expect(result.replayed).toBe(true);
      expect(ticketRepo.increment).not.toHaveBeenCalled();
      expect(redis.decr).toHaveBeenCalledWith(
        `matching:speedup:count:${me.userId}`,
      );
      // vẫn sửa lại score Redis từ tổng boost DB (retry-hoàn-tất an toàn, spec § 4)
      expect(redis.zadd).toHaveBeenCalledWith(
        expect.any(String),
        'XX',
        expect.any(String),
        'ticket-1',
      );
    });

    it('spendDiamond fail (không đủ diamond) → hoàn slot rate-limit, không boost', async () => {
      economy.spendDiamond.mockRejectedValueOnce(
        new DomainException('ECONOMY_WALLET_INSUFFICIENT_BALANCE', 'x', 422),
      );
      await expect(
        service.speedup(me, 'ticket-1', 'sk1'),
      ).rejects.toMatchObject({
        code: 'ECONOMY_WALLET_INSUFFICIENT_BALANCE',
      });
      expect(redis.decr).toHaveBeenCalledWith(
        `matching:speedup:count:${me.userId}`,
      );
      expect(ticketRepo.increment).not.toHaveBeenCalled();
    });

    it('RETRY request đã trả tiền (transaction tồn tại) → bỏ qua rate-limit, replay bình thường (docs/05 § 5.10)', async () => {
      economy.hasTransaction.mockResolvedValueOnce(true);
      economy.spendDiamond.mockResolvedValueOnce({
        transactionId: 'txn-1',
        replayed: true,
      });
      const result = await service.speedup(me, 'ticket-1', 'sk1');
      expect(result.replayed).toBe(true);
      expect(redis.eval).not.toHaveBeenCalled(); // retry không bị đếm/chặn như lượt mới
      expect(redis.decr).not.toHaveBeenCalled(); // không chiếm slot thì không có gì để hoàn
      expect(ticketRepo.increment).not.toHaveBeenCalled();
    });

    it('speedup ticket không còn queued → 409, không đụng rate-limit/tiền', async () => {
      ticketRepo.findOneBy.mockResolvedValueOnce(
        makeTicket({ status: MatchTicketStatus.Matched }),
      );
      await expect(
        service.speedup(me, 'ticket-1', 'sk1'),
      ).rejects.toMatchObject({
        code: MatchingErrors.TICKET_INVALID_TRANSITION,
      });
      expect(redis.eval).not.toHaveBeenCalled();
      expect(economy.spendDiamond).not.toHaveBeenCalled();
    });
  });
});
