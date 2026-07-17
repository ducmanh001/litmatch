import { MatchingController } from './matching.controller';
import {
  GenderPreference,
  MatchTicket,
  MatchTicketStatus,
  MatchType,
} from './entities/match-ticket.entity';

import type { MatchingService } from './matching.service';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

const me: AuthenticatedUser = {
  userId: 'user-me',
  isGuest: false,
  role: 'user',
};

function ticket(overrides: Partial<MatchTicket> = {}): MatchTicket {
  return Object.assign(new MatchTicket(), {
    id: 'ticket-1',
    userId: me.userId,
    matchType: MatchType.Voice,
    status: MatchTicketStatus.Queued,
    region: 'VN',
    ageBand: 5,
    genderPreference: GenderPreference.Any,
    sessionId: null,
    enqueuedAt: new Date('2026-07-15T00:00:00Z'),
    createdAt: new Date('2026-07-15T00:00:00Z'),
    ...overrides,
  });
}

describe('MatchingController — API contract', () => {
  const service = {
    joinQueue: jest.fn(),
    getActiveTicket: jest.fn(),
    getTicket: jest.fn(),
    cancelTicket: jest.fn(),
    confirmTicket: jest.fn(),
    speedup: jest.fn(),
    getSpeedupPriceDiamond: jest.fn(() => 73),
  };
  let controller: MatchingController;

  beforeEach(() => {
    jest.clearAllMocks();
    service.getSpeedupPriceDiamond.mockReturnValue(73);
    controller = new MatchingController(service as unknown as MatchingService);
  });

  it('mọi TicketDto dùng đúng giá server-configured, không hard-code client', async () => {
    service.joinQueue.mockResolvedValue(ticket());

    const result = await controller.joinQueue(
      me,
      { matchType: MatchType.Voice },
      'join-1',
    );

    expect(result.speedupPriceDiamond).toBe(73);
  });

  it('current ticket trả wrapper nullable an toàn khi user chưa queued/matched', async () => {
    service.getActiveTicket.mockResolvedValue(null);

    await expect(controller.getCurrentTicket(me)).resolves.toEqual({
      ticket: null,
    });
    expect(service.getActiveTicket).toHaveBeenCalledWith(me);
  });

  it('SpeedupResultDto giữ giá mới nhất trong nested ticket', async () => {
    service.speedup.mockResolvedValue({
      transactionId: 'transaction-1',
      replayed: false,
      ticket: ticket({ priorityBoostMs: 300_000 }),
    });

    const result = await controller.speedup(me, 'ticket-1', 'speedup-1');

    expect(result.ticket.speedupPriceDiamond).toBe(73);
  });
});
