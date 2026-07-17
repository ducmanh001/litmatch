import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DomainException } from '@litmatch/common-exceptions';
import { buildCursorPage, decodeCursor } from '@litmatch/common-dtos';
import { EntityManager, Repository } from 'typeorm';

import {
  isUniqueViolation,
  violatedConstraint,
} from '../../database/postgres-errors';
import { SupportErrors } from './support.errors';
import {
  SupportTicket,
  SupportTicketCategory,
  SupportTicketStatus,
} from './entities/support-ticket.entity';

import type { CursorPage } from '@litmatch/common-dtos';

const IDEMPOTENCY_CONSTRAINT = 'uq_support_ticket_user_idempotency';

@Injectable()
export class SupportService {
  constructor(
    @InjectRepository(SupportTicket)
    private readonly ticketRepo: Repository<SupportTicket>,
  ) {}

  async createTicket(
    userId: string,
    input: { category: SupportTicketCategory; message: string },
    idempotencyKey: string,
  ): Promise<SupportTicket> {
    const message = input.message.trim();
    try {
      return await this.ticketRepo.save(
        this.ticketRepo.create({
          userId,
          category: input.category,
          message,
          status: SupportTicketStatus.Open,
          staffResponse: null,
          idempotencyKey,
        }),
      );
    } catch (error) {
      if (
        !isUniqueViolation(error) ||
        !violatedConstraint(error, IDEMPOTENCY_CONSTRAINT)
      ) {
        throw error;
      }
      const replay = await this.ticketRepo.findOneByOrFail({
        userId,
        idempotencyKey,
      });
      if (replay.category !== input.category || replay.message !== message) {
        throw new DomainException(
          SupportErrors.IDEMPOTENCY_CONFLICT,
          'Idempotency-Key đã dùng cho một phản hồi khác',
          HttpStatus.CONFLICT,
        );
      }
      return replay;
    }
  }

  listMine(userId: string, limit: number, cursor?: string) {
    return this.list({ userId }, limit, cursor);
  }

  listAll(limit: number, cursor?: string, status?: SupportTicketStatus) {
    return this.list({ status }, limit, cursor);
  }

  async setStatusWithManager(
    manager: EntityManager,
    ticketId: string,
    input: { status: SupportTicketStatus; staffResponse?: string },
  ): Promise<SupportTicket> {
    const ticket = await manager.findOne(SupportTicket, {
      where: { id: ticketId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!ticket) {
      throw new DomainException(
        SupportErrors.TICKET_NOT_FOUND,
        'Không tìm thấy yêu cầu hỗ trợ',
        HttpStatus.NOT_FOUND,
      );
    }
    if (!canTransition(ticket.status, input.status)) {
      throw new DomainException(
        SupportErrors.INVALID_TRANSITION,
        `Không thể chuyển từ ${ticket.status} sang ${input.status}`,
        HttpStatus.CONFLICT,
      );
    }
    ticket.status = input.status;
    if (input.staffResponse !== undefined) {
      ticket.staffResponse = input.staffResponse.trim() || null;
    }
    return manager.save(ticket);
  }

  private async list(
    filter: { userId?: string; status?: SupportTicketStatus },
    limit: number,
    cursor?: string,
  ): Promise<CursorPage<SupportTicket>> {
    const qb = this.ticketRepo
      .createQueryBuilder('ticket')
      .orderBy('ticket.createdAt', 'DESC')
      .addOrderBy('ticket.id', 'DESC')
      .take(limit + 1);
    if (filter.userId !== undefined) {
      qb.andWhere('ticket.userId = :userId', { userId: filter.userId });
    }
    if (filter.status !== undefined) {
      qb.andWhere('ticket.status = :status', { status: filter.status });
    }
    if (cursor !== undefined) {
      const position = decodeCursor<{ createdAt?: unknown; id?: unknown }>(
        cursor,
      );
      if (
        typeof position?.createdAt !== 'string' ||
        typeof position.id !== 'string'
      ) {
        throw new DomainException(
          SupportErrors.CURSOR_INVALID,
          'Cursor không hợp lệ',
          HttpStatus.BAD_REQUEST,
        );
      }
      qb.andWhere(
        '(ticket.createdAt, ticket.id) < (:cursorCreatedAt, :cursorId)',
        { cursorCreatedAt: position.createdAt, cursorId: position.id },
      );
    }
    const rows = await qb.getMany();
    return buildCursorPage(rows, limit, (ticket) => ({
      createdAt: ticket.createdAt.toISOString(),
      id: ticket.id,
    }));
  }
}

function canTransition(
  current: SupportTicketStatus,
  next: SupportTicketStatus,
): boolean {
  if (current === next) return true;
  if (current === SupportTicketStatus.Open) {
    return [
      SupportTicketStatus.InProgress,
      SupportTicketStatus.Resolved,
      SupportTicketStatus.Closed,
    ].includes(next);
  }
  if (current === SupportTicketStatus.InProgress) {
    return [SupportTicketStatus.Resolved, SupportTicketStatus.Closed].includes(
      next,
    );
  }
  return (
    current === SupportTicketStatus.Resolved &&
    next === SupportTicketStatus.Closed
  );
}
