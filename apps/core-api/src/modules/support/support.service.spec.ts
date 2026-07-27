import { DomainException } from '@litmatch/common-exceptions';

import { SupportService } from './support.service';
import { SupportErrors } from './support.errors';
import {
  SupportTicket,
  SupportTicketCategory,
  SupportTicketStatus,
} from './entities/support-ticket.entity';

import type { EntityManager, Repository } from 'typeorm';

function ticket(overrides: Partial<SupportTicket> = {}): SupportTicket {
  return Object.assign(new SupportTicket(), {
    id: 'ticket-1',
    userId: 'user-1',
    category: SupportTicketCategory.Feedback,
    message: 'Nội dung',
    status: SupportTicketStatus.Open,
    staffResponse: null,
    idempotencyKey: 'key-1',
    createdAt: new Date('2026-07-24T00:00:00.000Z'),
    updatedAt: new Date('2026-07-24T00:00:00.000Z'),
    ...overrides,
  });
}

function uniqueViolation() {
  return {
    code: '23505',
    constraint: 'uq_support_ticket_user_idempotency',
  };
}

describe('SupportService', () => {
  let ticketRepo: {
    create: jest.Mock;
    save: jest.Mock;
    findOneByOrFail: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let service: SupportService;

  beforeEach(() => {
    ticketRepo = {
      create: jest.fn((input) => Object.assign(new SupportTicket(), input)),
      save: jest.fn(async (input) => ticket(input)),
      findOneByOrFail: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    service = new SupportService(
      ticketRepo as unknown as Repository<SupportTicket>,
    );
  });

  it('tạo ticket đã trim message, trạng thái open và idempotency key thuộc user', async () => {
    await service.createTicket(
      'user-1',
      {
        category: SupportTicketCategory.Bug,
        message: '  Không gửi được tin nhắn  ',
      },
      'key-1',
    );

    expect(ticketRepo.create).toHaveBeenCalledWith({
      userId: 'user-1',
      category: SupportTicketCategory.Bug,
      message: 'Không gửi được tin nhắn',
      status: SupportTicketStatus.Open,
      staffResponse: null,
      idempotencyKey: 'key-1',
    });
  });

  it('unique violation cùng payload trả ticket cũ thay vì tạo trùng', async () => {
    const replay = ticket({
      category: SupportTicketCategory.Idea,
      message: 'Thêm dark mode',
    });
    ticketRepo.save.mockRejectedValue(uniqueViolation());
    ticketRepo.findOneByOrFail.mockResolvedValue(replay);

    await expect(
      service.createTicket(
        'user-1',
        {
          category: SupportTicketCategory.Idea,
          message: '  Thêm dark mode ',
        },
        'key-1',
      ),
    ).resolves.toBe(replay);
    expect(ticketRepo.findOneByOrFail).toHaveBeenCalledWith({
      userId: 'user-1',
      idempotencyKey: 'key-1',
    });
  });

  it('unique violation khác payload trả conflict, không replay nhầm request', async () => {
    ticketRepo.save.mockRejectedValue(uniqueViolation());
    ticketRepo.findOneByOrFail.mockResolvedValue(
      ticket({
        category: SupportTicketCategory.Feedback,
        message: 'Payload cũ',
      }),
    );

    const error = await service
      .createTicket(
        'user-1',
        { category: SupportTicketCategory.Bug, message: 'Payload mới' },
        'key-1',
      )
      .catch((caught) => caught);

    expect(error).toBeInstanceOf(DomainException);
    expect((error as DomainException).code).toBe(
      SupportErrors.IDEMPOTENCY_CONFLICT,
    );
  });

  it('listMine khóa ownership bằng filter userId và dùng keyset pagination', async () => {
    const queryBuilder = {
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn(async () => [ticket()]),
    };
    ticketRepo.createQueryBuilder.mockReturnValue(queryBuilder);

    const page = await service.listMine('user-1', 20);

    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'ticket.userId = :userId',
      { userId: 'user-1' },
    );
    expect(queryBuilder.orderBy).toHaveBeenCalledWith(
      'ticket.createdAt',
      'DESC',
    );
    expect(queryBuilder.addOrderBy).toHaveBeenCalledWith('ticket.id', 'DESC');
    expect(queryBuilder.take).toHaveBeenCalledWith(21);
    expect(page.items).toHaveLength(1);
  });

  it('setStatusWithManager khóa row, trim response và chặn transition ngược', async () => {
    const current = ticket({ status: SupportTicketStatus.Open });
    const manager = {
      findOne: jest.fn(async () => current),
      save: jest.fn(async (input) => input),
    };

    const updated = await service.setStatusWithManager(
      manager as unknown as EntityManager,
      current.id,
      {
        status: SupportTicketStatus.Resolved,
        staffResponse: '  Đã xử lý  ',
      },
    );

    expect(manager.findOne).toHaveBeenCalledWith(SupportTicket, {
      where: { id: current.id },
      lock: { mode: 'pessimistic_write' },
    });
    expect(updated.status).toBe(SupportTicketStatus.Resolved);
    expect(updated.staffResponse).toBe('Đã xử lý');

    const error = await service
      .setStatusWithManager(manager as unknown as EntityManager, current.id, {
        status: SupportTicketStatus.Open,
      })
      .catch((caught) => caught);
    expect((error as DomainException).code).toBe(
      SupportErrors.INVALID_TRANSITION,
    );
  });
});
