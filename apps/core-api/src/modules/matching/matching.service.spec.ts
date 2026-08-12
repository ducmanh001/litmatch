import { DomainException } from '@litmatch/common-exceptions';

import { MatchingService } from './matching.service';
import { MatchingErrors } from './matching.errors';
import { MatcherWakeup } from './matcher-wakeup';
import {
  GenderPreference,
  MatchTicket,
  MatchTicketStatus,
  MatchType,
} from './entities/match-ticket.entity';
import { TransactionType } from '../economy';
import { UserStatus } from '../user';
import { GuestMatchQuotaService } from './services/guest-match-quota.service';

import type { ConfigService } from '@nestjs/config';
import type { DataSource, EntityManager, Repository } from 'typeorm';

import type { CoreApiEnv } from '../../config/env.validation';
import type { EconomyService } from '../economy';
import type { User, UserService } from '../user';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

const CONFIG: Record<string, unknown> = {
  MATCHING_AGE_BAND_SIZE: 5,
  MATCHING_SPEEDUP_PRICE_DIAMOND: 50,
  MATCHING_VIP_SPEEDUP_PRICE_DIAMOND: 40,
  MATCHING_SVIP_SPEEDUP_PRICE_DIAMOND: 30,
  MATCHING_PRIORITY_BOOST_MS: 300_000,
  MATCHING_TRUST_PENALTY_MS_PER_POINT: 2000,
  MATCHING_TRUST_PENALTY_MAX_MS: 120_000,
};

const me: AuthenticatedUser = {
  userId: 'user-me',
  isGuest: false,
  role: 'user',
};

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
    trustPenaltyMs: 0,
    sessionId: null,
    paidDiamond: false,
    idempotencyKey: 'matching:join:user-me:k1',
    createdAt: new Date('2026-07-12T00:00:00Z'),
    updatedAt: new Date('2026-07-12T00:00:00Z'),
    ...overrides,
  });
}

describe('MatchingService (unit — mock repo/capabilities/economy)', () => {
  let ticketRepo: jest.Mocked<
    Pick<
      Repository<MatchTicket>,
      | 'save'
      | 'create'
      | 'findOne'
      | 'findOneBy'
      | 'findOneByOrFail'
      | 'increment'
    >
  >;
  let queue: Record<string, jest.Mock>;
  let realtime: Record<string, jest.Mock>;
  let economy: {
    spendDiamond: jest.Mock;
    spendDiamondInTransaction: jest.Mock;
    getActiveVipTier: jest.Mock;
  };
  let notificationService: {
    createWithManager: jest.Mock;
    sendPush: jest.Mock;
  };
  let userService: { getByIdOrThrow: jest.Mock };
  let manager: jest.Mocked<
    Pick<EntityManager, 'findOne' | 'findOneBy' | 'save' | 'create'>
  >;
  let dataSource: { transaction: jest.Mock };
  let guestQuota: {
    authorize: jest.Mock;
    consume: jest.Mock;
    consumeForMatch: jest.Mock;
  };
  let service: MatchingService;
  let matcherWakeup: MatcherWakeup;

  beforeEach(() => {
    ticketRepo = {
      save: jest.fn(async (t) => t as MatchTicket),
      create: jest.fn((input) => Object.assign(new MatchTicket(), input)),
      findOne: jest.fn(),
      findOneBy: jest.fn(),
      findOneByOrFail: jest.fn(),
      increment: jest.fn(async () => ({
        affected: 1,
        raw: [],
        generatedMaps: [],
      })),
    } as never;
    queue = {
      enqueue: jest.fn(async () => undefined),
      remove: jest.fn(async () => undefined),
      popMin: jest.fn(async () => []),
      listActiveShards: jest.fn(async () => []),
      markActive: jest.fn(async () => undefined),
      unmarkActive: jest.fn(async () => undefined),
      hasEntries: jest.fn(async () => false),
      close: jest.fn(async () => undefined),
    };
    realtime = {
      publish: jest.fn(async () => 1),
    };
    economy = {
      spendDiamond: jest.fn(async () => ({
        transactionId: 'txn-1',
        replayed: false,
      })),
      spendDiamondInTransaction: jest.fn(async () => ({
        transactionId: 'txn-extra-1',
        replayed: false,
      })),
      getActiveVipTier: jest.fn(async () => null),
    };
    notificationService = {
      createWithManager: jest.fn(async (_manager, input) => ({
        id: 'notif-1',
        ...input,
      })),
      sendPush: jest.fn(async () => undefined),
    };
    matcherWakeup = new MatcherWakeup();
    jest.spyOn(matcherWakeup, 'notify');
    userService = {
      getByIdOrThrow: jest.fn(
        async () =>
          ({
            id: me.userId,
            status: UserStatus.Active,
            region: 'VN',
            birthDate: '2000-01-01',
            trustScore: 100,
          }) as User,
      ),
    };
    manager = {
      findOne: jest.fn(),
      findOneBy: jest.fn().mockResolvedValue(null),
      create: jest.fn((_entity, input) =>
        Object.assign(new MatchTicket(), { id: 'ticket-1' }, input),
      ),
      save: jest.fn(async (t) => t),
    } as never;
    dataSource = {
      transaction: jest.fn(async (cb: (m: EntityManager) => Promise<unknown>) =>
        cb(manager as never),
      ),
    };
    guestQuota = {
      authorize: jest.fn(async () => ({
        user: await userService.getByIdOrThrow(),
        quotaDate: '2026-07-29',
        keyHashes: [],
      })),
      consume: jest.fn().mockResolvedValue(undefined),
      consumeForMatch: jest.fn().mockResolvedValue({
        quotaDate: '2026-07-29',
        freeLimit: 10,
        tier: null,
        paidDiamond: false,
      }),
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
      notificationService as never,
      config,
      queue as never,
      realtime as never,
      matcherWakeup,
      guestQuota as unknown as GuestMatchQuotaService,
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
      expect(queue.enqueue).toHaveBeenCalledWith(
        'matching:queue:voice:VN:5',
        String(ticket.enqueuedAt.getTime()),
        ticket.id,
        'NX',
      );
      expect(queue.markActive).toHaveBeenCalledWith(
        'matching:queue:voice:VN:5',
      );
      expect(matcherWakeup.notify).toHaveBeenCalledTimes(1);
    });

    it('profile thiếu region/birthDate → shard GLOBAL + ageBand -1 (không chặn, không đoán)', async () => {
      userService.getByIdOrThrow.mockResolvedValue({
        id: me.userId,
        status: UserStatus.Active,
        region: null,
        birthDate: null,
        trustScore: 100,
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
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('retry cùng Idempotency-Key → trả lại ticket cũ + re-enqueue NX, không tạo ticket đôi', async () => {
      const existing = makeTicket();
      manager.save.mockRejectedValueOnce({
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
      expect(queue.enqueue).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        existing.id,
        'NX',
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
      manager.save.mockRejectedValueOnce({
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
      manager.save.mockRejectedValueOnce({
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
      manager.save.mockRejectedValueOnce({
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

  describe('getActiveTicket — phục hồi state sau reload', () => {
    it.each([MatchTicketStatus.Queued, MatchTicketStatus.Matched])(
      'trả ticket %s của đúng user từ auth',
      async (status) => {
        const active = makeTicket({ status });
        ticketRepo.findOne.mockResolvedValueOnce(active);

        await expect(service.getActiveTicket(me)).resolves.toBe(active);
        expect(ticketRepo.findOne).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({ userId: me.userId }),
          }),
        );
      },
    );

    it('không có queued/matched → null, không biến thành 404', async () => {
      ticketRepo.findOne.mockResolvedValueOnce(null);
      await expect(service.getActiveTicket(me)).resolves.toBeNull();
    });

    it('giá speed-up trả cho DTO đọc đúng config server', () => {
      expect(service.getSpeedupPriceDiamond()).toBe(50);
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
      expect(queue.remove).toHaveBeenCalledWith(
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

    it('happy path: trừ Diamond rồi boost DB + ZADD XX score tuyệt đối', async () => {
      economy.spendDiamond.mockImplementationOnce(async () => {
        return { transactionId: 'txn-1', replayed: false };
      });

      const result = await service.speedup(me, 'ticket-1', 'sk1');
      expect(economy.spendDiamond).toHaveBeenCalledWith(
        me.userId,
        TransactionType.MatchingSpeedup,
        50,
        `matching:speedup:${me.userId}:sk1`,
        { ticketId: 'ticket-1', priceDiamond: 50 },
      );
      expect(ticketRepo.increment).toHaveBeenCalledWith(
        { id: 'ticket-1', status: MatchTicketStatus.Queued },
        'priorityBoostMs',
        300_000,
      );
      // score tuyệt đối = enqueuedAtMs - tổng boost trong DB (không ZINCRBY tương đối)
      const expectedScore =
        new Date('2026-07-12T00:00:00Z').getTime() - 300_000;
      expect(queue.enqueue).toHaveBeenCalledWith(
        'matching:queue:voice:VN:5',
        String(expectedScore),
        'ticket-1',
        'XX',
      );
      expect(result.replayed).toBe(false);
    });

    it('cho phép tăng tốc không giới hạn số lần nếu đủ Diamond', async () => {
      await service.speedup(me, 'ticket-1', 'sk1');
      await service.speedup(me, 'ticket-1', 'sk2');

      expect(economy.spendDiamond).toHaveBeenCalledTimes(2);
      expect(ticketRepo.increment).toHaveBeenCalledTimes(2);
      expect(economy.spendDiamond).toHaveBeenLastCalledWith(
        me.userId,
        TransactionType.MatchingSpeedup,
        50,
        `matching:speedup:${me.userId}:sk2`,
        { ticketId: 'ticket-1', priceDiamond: 50 },
      );
    });

    it('replay cùng key → KHÔNG cộng boost lần 2', async () => {
      economy.spendDiamond.mockResolvedValueOnce({
        transactionId: 'txn-1',
        replayed: true,
      });
      const result = await service.speedup(me, 'ticket-1', 'sk1');
      expect(result.replayed).toBe(true);
      expect(ticketRepo.increment).not.toHaveBeenCalled();
      // vẫn sửa lại score Redis từ tổng boost DB (retry-hoàn-tất an toàn, spec § 4)
      expect(queue.enqueue).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        'ticket-1',
        'XX',
      );
    });

    it('spendDiamond fail (không đủ diamond) → không boost', async () => {
      economy.spendDiamond.mockRejectedValueOnce(
        new DomainException('ECONOMY_WALLET_INSUFFICIENT_BALANCE', 'x', 422),
      );
      await expect(
        service.speedup(me, 'ticket-1', 'sk1'),
      ).rejects.toMatchObject({
        code: 'ECONOMY_WALLET_INSUFFICIENT_BALANCE',
      });
      expect(ticketRepo.increment).not.toHaveBeenCalled();
    });

    it('VIP/SVIP dùng mức giá speed-up riêng', async () => {
      economy.getActiveVipTier.mockResolvedValueOnce('vip');
      await service.speedup(me, 'ticket-1', 'vip-key');
      expect(economy.spendDiamond).toHaveBeenCalledWith(
        me.userId,
        TransactionType.MatchingSpeedup,
        40,
        `matching:speedup:${me.userId}:vip-key`,
        { ticketId: 'ticket-1', priceDiamond: 40 },
      );
    });

    it('retry request đã trả tiền → replay bình thường', async () => {
      economy.spendDiamond.mockResolvedValueOnce({
        transactionId: 'txn-1',
        replayed: true,
      });
      const result = await service.speedup(me, 'ticket-1', 'sk1');
      expect(result.replayed).toBe(true);
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
      expect(economy.spendDiamond).not.toHaveBeenCalled();
    });
  });
});
