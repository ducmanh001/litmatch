import { ConfigService } from '@nestjs/config';
import { DataSource, Repository } from 'typeorm';

import { MatchingErrors } from './matching.errors';
import { MatchingService } from './matching.service';
import { MatchTicket, MatchTicketStatus, MatchType } from './entities/match-ticket.entity';
import { MatchingOperation } from './entities/matching-operation.entity';

import { Gender, UserStatus } from '../user';

import type { CreateMatchTicketDto } from './dto/matching.dtos';

const baseTicket = (over: Partial<MatchTicket> = {}): MatchTicket =>
  ({
    id: 'ticket-1',
    userId: 'user-1',
    idempotencyKey: 'idem-1',
    requestHash: 'a'.repeat(64),
    matchType: MatchType.Soul,
    status: MatchTicketStatus.Queued,
    region: 'VN',
    ownGender: Gender.Male,
    ownAge: 24,
    criteria: { genderPref: 'any', minAge: 18, maxAge: 99 },
    priority: false,
    speedupTransactionId: null,
    speedupAppliedAt: null,
    priorityBoostMs: null,
    pairedTicketId: null,
    matchSessionId: null,
    queuedAt: new Date('2026-01-01T00:00:00Z'),
    createdAt: new Date('2026-01-01T00:00:00Z'),
    expiresAt: new Date('2026-01-01T00:02:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    version: 1,
    ...over,
  }) as MatchTicket;

describe('MatchingService validation/ownership', () => {
  const ticketRepo = { findOneBy: jest.fn() } as unknown as Repository<MatchTicket>;
  const operationRepo = {} as Repository<MatchingOperation>;
  const dataSource = { transaction: jest.fn() } as unknown as DataSource;
  const userService = { getByIdOrThrow: jest.fn() };
  const economyService = { spendDiamond: jest.fn(), reverseTransaction: jest.fn() };
  const config = { getOrThrow: jest.fn() } as unknown as ConfigService;
  const service = new MatchingService(
    ticketRepo,
    operationRepo,
    dataSource,
    userService as never,
    economyService as never,
    config,
  );

  const dto: CreateMatchTicketDto = {
    matchType: MatchType.Soul,
    criteria: { genderPref: 'any', minAge: 18, maxAge: 30 },
  };

  beforeEach(() => jest.clearAllMocks());

  it('thiếu Idempotency-Key → 400', async () => {
    await expect(service.createTicket('user-1', dto, undefined)).rejects.toMatchObject({
      code: MatchingErrors.IDEMPOTENCY_KEY_MISSING,
    });
  });

  it('minAge > maxAge → 422', async () => {
    await expect(
      service.createTicket(
        'user-1',
        { ...dto, criteria: { genderPref: 'any', minAge: 30, maxAge: 18 } },
        'key',
      ),
    ).rejects.toMatchObject({ code: MatchingErrors.CRITERIA_INVALID });
  });

  it('profile thiếu birthDate hoặc region bị chặn trước transaction', async () => {
    userService.getByIdOrThrow.mockResolvedValue({
      birthDate: null,
      region: null,
      gender: Gender.Male,
      status: UserStatus.Active,
      isGuest: false,
    });
    await expect(service.createTicket('user-1', dto, 'key')).rejects.toMatchObject({
      code: MatchingErrors.PROFILE_INCOMPLETE,
    });
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('ticket của user khác → 403', async () => {
    (ticketRepo.findOneBy as jest.Mock).mockResolvedValue(baseTicket({ userId: 'other-user' }));
    await expect(service.getTicket('user-1', 'ticket-1')).rejects.toMatchObject({
      code: MatchingErrors.TICKET_FORBIDDEN,
    });
  });

  it('confirm ticket chưa matched → 409', async () => {
    (ticketRepo.findOneBy as jest.Mock).mockResolvedValue(baseTicket());
    await expect(service.confirmTicket('user-1', 'ticket-1')).rejects.toMatchObject({
      code: MatchingErrors.TICKET_NOT_MATCHED,
    });
  });

  it('guest không được speed-up và Economy không bị gọi', async () => {
    userService.getByIdOrThrow.mockResolvedValue({ status: UserStatus.Active, isGuest: true });
    await expect(service.applySpeedup('user-1', 'ticket-1', 'key')).rejects.toMatchObject({
      code: MatchingErrors.GUEST_SPEEDUP_FORBIDDEN,
    });
    expect(economyService.spendDiamond).not.toHaveBeenCalled();
  });
});
