import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DomainException } from '@litmatch/common-exceptions';
import { DataSource, In, MoreThanOrEqual, Repository } from 'typeorm';

import { MatchingErrors } from './matching.errors';
import { enqueueTicketProjection } from './matching-queue-projection.service';
import { MatchSession, MatchSessionStatus } from './entities/match-session.entity';
import { MatchCriteria, MatchTicket, MatchTicketStatus, MatchType } from './entities/match-ticket.entity';
import {
  MatchingOperation,
  MatchingOperationKind,
  MatchingOperationStatus,
} from './entities/matching-operation.entity';

import { UserService, UserStatus } from '../user';
import { EconomyService, TransactionType } from '../economy';

import type { CreateMatchTicketDto } from './dto/matching.dtos';

const PG_UNIQUE_VIOLATION = '23505';

export interface MatchTicketView {
  id: string;
  matchType: MatchType;
  status: MatchTicketStatus;
  priority: boolean;
  matchSessionId: string | null;
  queuedAt: Date;
  expiresAt: Date;
}

@Injectable()
export class MatchingService {
  constructor(
    @InjectRepository(MatchTicket) private readonly ticketRepo: Repository<MatchTicket>,
    @InjectRepository(MatchingOperation) private readonly operationRepo: Repository<MatchingOperation>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly userService: UserService,
    private readonly economyService: EconomyService,
    private readonly config: ConfigService,
  ) {}

  async createTicket(
    userId: string,
    dto: CreateMatchTicketDto,
    rawIdempotencyKey: string | undefined,
  ): Promise<MatchTicketView> {
    const idempotencyKey = this.validateIdempotencyKey(rawIdempotencyKey);
    if (!dto.criteria || dto.criteria.minAge > dto.criteria.maxAge) {
      throw new DomainException(MatchingErrors.CRITERIA_INVALID, 'minAge phải <= maxAge', 422);
    }
    const requestHash = this.hash({
      matchType: dto.matchType,
      criteria: {
        genderPref: dto.criteria.genderPref,
        minAge: dto.criteria.minAge,
        maxAge: dto.criteria.maxAge,
      },
    });

    const user = await this.userService.getByIdOrThrow(userId);
    this.assertUserCanMatch(user.status);
    const ownAge = this.deriveAge(user.birthDate);
    if (!user.region) {
      throw new DomainException(
        MatchingErrors.PROFILE_INCOMPLETE,
        'Hồ sơ chưa có region — cập nhật profile trước khi vào hàng đợi ghép cặp',
        422,
      );
    }
    const region = user.region;

    const maxWaitSeconds = this.config.getOrThrow<number>('MATCHING_QUEUE_MAX_WAIT_SECONDS');
    const queuedAt = new Date();
    const expiresAt = new Date(queuedAt.getTime() + maxWaitSeconds * 1000);

    try {
      const ticket = await this.dataSource.transaction(async (manager) => {
        // Serializes guest quota and create/replay decisions for one user across API instances.
        await manager.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [
          `matching:create:${userId}`,
        ]);
        const repo = manager.getRepository(MatchTicket);
        const existing = await repo.findOneBy({ userId, idempotencyKey });
        if (existing) return this.assertTicketReplay(existing, requestHash);

        if (user.isGuest) {
          const startOfUtcDay = new Date();
          startOfUtcDay.setUTCHours(0, 0, 0, 0);
          const used = await repo.countBy({ userId, createdAt: MoreThanOrEqual(startOfUtcDay) });
          const limit = this.config.getOrThrow<number>('MATCHING_GUEST_DAILY_TICKET_LIMIT');
          if (used >= limit) {
            throw new DomainException(
              MatchingErrors.GUEST_DAILY_LIMIT,
              `Tài khoản guest chỉ được tạo tối đa ${limit} ticket/ngày`,
              429,
            );
          }
        }

        const created = await repo.save(
          repo.create({
            userId,
            idempotencyKey,
            requestHash,
            matchType: dto.matchType,
            status: MatchTicketStatus.Queued,
            region,
            ownGender: user.gender,
            ownAge,
            criteria: dto.criteria as MatchCriteria,
            queuedAt,
            createdAt: queuedAt,
            expiresAt,
          }),
        );
        await enqueueTicketProjection(manager, created.id);
        return created;
      });
      return this.toView(ticket);
    } catch (err) {
      if ((err as { code?: string }).code !== PG_UNIQUE_VIOLATION) throw err;
      const existing = await this.ticketRepo.findOneBy({ userId, idempotencyKey });
      if (existing) return this.toView(this.assertTicketReplay(existing, requestHash));
      throw new DomainException(MatchingErrors.TICKET_ALREADY_QUEUED, 'Bạn đang có 1 ticket ghép cặp khác', 409);
    }
  }

  async getTicket(userId: string, ticketId: string): Promise<MatchTicketView> {
    return this.toView(await this.findOwnedTicket(userId, ticketId));
  }

  async cancelTicket(userId: string, ticketId: string): Promise<MatchTicketView> {
    await this.findOwnedTicket(userId, ticketId);
    const updated = await this.dataSource.transaction(async (manager) => {
      const result = await manager
        .createQueryBuilder()
        .update(MatchTicket)
        .set({ status: MatchTicketStatus.Cancelled })
        .where('id = :id AND status = :status', { id: ticketId, status: MatchTicketStatus.Queued })
        .execute();
      if (!result.affected) {
        throw new DomainException(MatchingErrors.TICKET_NOT_QUEUED, 'Ticket không còn ở trạng thái chờ ghép', 409);
      }
      await enqueueTicketProjection(manager, ticketId);
      return manager.getRepository(MatchTicket).findOneByOrFail({ id: ticketId });
    });
    return this.toView(updated);
  }

  async confirmTicket(userId: string, ticketId: string): Promise<MatchTicketView> {
    const ticket = await this.findOwnedTicket(userId, ticketId);
    if (ticket.status === MatchTicketStatus.Confirmed) return this.toView(ticket);
    if (ticket.status !== MatchTicketStatus.Matched || !ticket.pairedTicketId) {
      throw new DomainException(MatchingErrors.TICKET_NOT_MATCHED, 'Ticket chưa được ghép cặp', 409);
    }

    const ids = [ticket.id, ticket.pairedTicketId].sort();
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(MatchTicket);
      const rows = await repo
        .createQueryBuilder('t')
        .setLock('pessimistic_write')
        .where('t.id IN (:...ids)', { ids })
        .orderBy('t.id', 'ASC')
        .getMany();
      const self = rows.find((row) => row.id === ticket.id);
      const partner = rows.find((row) => row.id === ticket.pairedTicketId);
      if (self?.status === MatchTicketStatus.Confirmed) return this.toView(self);
      if (
        !self ||
        !partner ||
        self.status !== MatchTicketStatus.Matched ||
        partner.pairedTicketId !== self.id ||
        self.pairedTicketId !== partner.id ||
        self.expiresAt <= new Date()
      ) {
        throw new DomainException(MatchingErrors.TICKET_NOT_MATCHED, 'Ticket chưa được ghép cặp hoặc đã hết hạn', 409);
      }
      self.status = MatchTicketStatus.Confirmed;
      await repo.save(self);

      if (partner.status === MatchTicketStatus.Confirmed) {
        const session = await manager.getRepository(MatchSession).save(
          manager.getRepository(MatchSession).create({
            matchType: self.matchType,
            userAId: self.userId,
            userBId: partner.userId,
            status: MatchSessionStatus.Active,
          }),
        );
        await repo.update({ id: In([self.id, partner.id]) }, { matchSessionId: session.id });
        return this.toView({ ...self, matchSessionId: session.id });
      }
      return this.toView(self);
    });
  }

  async applySpeedup(
    userId: string,
    ticketId: string,
    rawIdempotencyKey: string | undefined,
  ): Promise<MatchTicketView> {
    const idempotencyKey = this.validateIdempotencyKey(rawIdempotencyKey);
    const user = await this.userService.getByIdOrThrow(userId);
    this.assertUserCanMatch(user.status);
    if (user.isGuest) {
      throw new DomainException(
        MatchingErrors.GUEST_SPEEDUP_FORBIDDEN,
        'Tài khoản guest không được sử dụng diamond để speed-up',
        403,
      );
    }
    const requestHash = this.hash({ ticketId, kind: MatchingOperationKind.Speedup });
    const operation = await this.getOrCreateSpeedupOperation(userId, ticketId, idempotencyKey, requestHash);
    return this.resumeSpeedupOperation(operation.id);
  }

  private async getOrCreateSpeedupOperation(
    userId: string,
    ticketId: string,
    idempotencyKey: string,
    requestHash: string,
  ): Promise<MatchingOperation> {
    try {
      return await this.dataSource.transaction(async (manager) => {
        await manager.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [
          `matching:speedup:${userId}`,
        ]);
        const operationRepo = manager.getRepository(MatchingOperation);
        const replay = await operationRepo.findOneBy({
          userId,
          kind: MatchingOperationKind.Speedup,
          idempotencyKey,
        });
        if (replay) return this.assertOperationReplay(replay, requestHash);

        const ticket = await manager
          .getRepository(MatchTicket)
          .createQueryBuilder('ticket')
          .setLock('pessimistic_write')
          .where('ticket.id = :ticketId', { ticketId })
          .getOne();
        this.assertOwnedTicket(ticket, userId);
        if (ticket.status !== MatchTicketStatus.Queued) {
          throw new DomainException(MatchingErrors.TICKET_NOT_QUEUED, 'Chỉ speed-up được ticket đang chờ ghép', 409);
        }
        if (ticket.priority) {
          throw new DomainException(MatchingErrors.TICKET_ALREADY_PRIORITY, 'Ticket đã được speed-up', 409);
        }
        await this.assertSpeedupRateLimit(manager.getRepository(MatchingOperation), userId);

        return operationRepo.save(
          operationRepo.create({
            userId,
            ticketId,
            kind: MatchingOperationKind.Speedup,
            idempotencyKey,
            requestHash,
            priceDiamond: this.config.getOrThrow<number>('MATCHING_SPEEDUP_PRICE_DIAMOND').toString(),
            priorityBoostMs: this.config.getOrThrow<number>('MATCHING_PRIORITY_BOOST_MS'),
            policyVersion: 1,
            status: MatchingOperationStatus.Pending,
            economyTransactionId: null,
            appliedAt: null,
          }),
        );
      });
    } catch (err) {
      if ((err as { code?: string }).code !== PG_UNIQUE_VIOLATION) throw err;
      const replay = await this.operationRepo.findOneBy({
        userId,
        kind: MatchingOperationKind.Speedup,
        idempotencyKey,
      });
      if (replay) return this.assertOperationReplay(replay, requestHash);
      throw new DomainException(
        MatchingErrors.TICKET_ALREADY_PRIORITY,
        'Một yêu cầu speed-up khác đang xử lý cho ticket này',
        409,
      );
    }
  }

  async resumeSpeedupOperation(operationId: string): Promise<MatchTicketView> {
    for (let step = 0; step < 5; step++) {
      const operation = await this.operationRepo.findOneByOrFail({ id: operationId });
      if (operation.status === MatchingOperationStatus.Applied) {
        return this.toView(await this.findOwnedTicket(operation.userId, operation.ticketId));
      }
      if (operation.status === MatchingOperationStatus.Compensated) {
        throw new DomainException(MatchingErrors.TICKET_NOT_QUEUED, 'Speed-up không thể áp dụng và đã được hoàn tiền', 409);
      }
      if (operation.status === MatchingOperationStatus.Pending) {
        const price = BigInt(operation.priceDiamond);
        const { transactionId } = await this.economyService.spendDiamond({
          userId: operation.userId,
          amount: price,
          type: TransactionType.MatchingSpeedup,
          idempotencyKey: `matching:speedup:operation:${operation.id}`,
          metadata: {
            version: 1,
            feature: 'matching_speedup',
            ticketId: operation.ticketId,
            priceDiamond: price.toString(),
            priorityBoostMs: operation.priorityBoostMs,
            policyVersion: operation.policyVersion,
          },
        });
        await this.operationRepo.update(
          { id: operation.id, status: MatchingOperationStatus.Pending },
          { status: MatchingOperationStatus.Charged, economyTransactionId: transactionId },
        );
        continue;
      }
      if (operation.status === MatchingOperationStatus.Charged) {
        await this.applyChargedSpeedup(operation.id);
        continue;
      }
      if (operation.status === MatchingOperationStatus.Compensating) {
        if (!operation.economyTransactionId) throw new Error('Speed-up compensating thiếu economy transaction');
        await this.economyService.reverseTransaction(
          operation.economyTransactionId,
          `matching:speedup:compensation:${operation.id}`,
          'ticket_not_queued_after_charge',
        );
        await this.operationRepo.update(
          { id: operation.id, status: MatchingOperationStatus.Compensating },
          { status: MatchingOperationStatus.Compensated },
        );
      }
    }
    throw new Error(`Không hội tụ được speed-up operation ${operationId}`);
  }

  private async applyChargedSpeedup(operationId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const operationRepo = manager.getRepository(MatchingOperation);
      const operation = await operationRepo
        .createQueryBuilder('operation')
        .setLock('pessimistic_write')
        .where('operation.id = :operationId', { operationId })
        .getOneOrFail();
      if (operation.status !== MatchingOperationStatus.Charged) return;
      if (!operation.economyTransactionId) throw new Error('Speed-up charged thiếu economy transaction');

      const ticketRepo = manager.getRepository(MatchTicket);
      const ticket = await ticketRepo
        .createQueryBuilder('ticket')
        .setLock('pessimistic_write')
        .where('ticket.id = :ticketId', { ticketId: operation.ticketId })
        .getOneOrFail();
      if (ticket.status === MatchTicketStatus.Queued && !ticket.priority) {
        const appliedAt = new Date();
        ticket.priority = true;
        ticket.speedupTransactionId = operation.economyTransactionId;
        ticket.speedupAppliedAt = appliedAt;
        ticket.priorityBoostMs = operation.priorityBoostMs;
        await ticketRepo.save(ticket);
        operation.status = MatchingOperationStatus.Applied;
        operation.appliedAt = appliedAt;
        await operationRepo.save(operation);
        await enqueueTicketProjection(manager, ticket.id);
        return;
      }
      if (ticket.priority && ticket.speedupTransactionId === operation.economyTransactionId) {
        operation.status = MatchingOperationStatus.Applied;
        operation.appliedAt = ticket.speedupAppliedAt ?? new Date();
        await operationRepo.save(operation);
        return;
      }
      operation.status = MatchingOperationStatus.Compensating;
      await operationRepo.save(operation);
    });
  }

  private async assertSpeedupRateLimit(repo: Repository<MatchingOperation>, userId: string): Promise<void> {
    const maxPerHour = this.config.getOrThrow<number>('MATCHING_SPEEDUP_MAX_PER_HOUR');
    const recent = await repo.countBy({
      userId,
      kind: MatchingOperationKind.Speedup,
      status: MatchingOperationStatus.Applied,
      appliedAt: MoreThanOrEqual(new Date(Date.now() - 3600_000)),
    });
    if (recent >= maxPerHour) {
      throw new DomainException(
        MatchingErrors.SPEEDUP_RATE_LIMITED,
        `Chỉ được speed-up tối đa ${maxPerHour} lần/giờ`,
        429,
      );
    }
  }

  private assertTicketReplay(ticket: MatchTicket, requestHash: string): MatchTicket {
    if (ticket.requestHash !== requestHash) {
      throw new DomainException(
        MatchingErrors.IDEMPOTENCY_CONFLICT,
        'Idempotency key đã dùng cho request tạo ticket khác nội dung',
        409,
      );
    }
    return ticket;
  }

  private assertOperationReplay(operation: MatchingOperation, requestHash: string): MatchingOperation {
    if (operation.requestHash !== requestHash) {
      throw new DomainException(
        MatchingErrors.IDEMPOTENCY_CONFLICT,
        'Idempotency key đã dùng cho request speed-up khác nội dung',
        409,
      );
    }
    return operation;
  }

  private async findOwnedTicket(userId: string, ticketId: string): Promise<MatchTicket> {
    const ticket = await this.ticketRepo.findOneBy({ id: ticketId });
    this.assertOwnedTicket(ticket, userId);
    return ticket as MatchTicket;
  }

  private assertOwnedTicket(ticket: MatchTicket | null, userId: string): asserts ticket is MatchTicket {
    if (!ticket) throw new DomainException(MatchingErrors.TICKET_NOT_FOUND, 'Không tìm thấy ticket', 404);
    if (ticket.userId !== userId) {
      throw new DomainException(MatchingErrors.TICKET_FORBIDDEN, 'Ticket không thuộc về bạn', 403);
    }
  }

  private assertUserCanMatch(status: UserStatus): void {
    if (status !== UserStatus.Active) {
      throw new DomainException(MatchingErrors.TICKET_FORBIDDEN, 'Tài khoản không được phép ghép cặp', 403);
    }
  }

  private validateIdempotencyKey(value: string | undefined): string {
    const key = value?.trim();
    if (!key) throw new DomainException(MatchingErrors.IDEMPOTENCY_KEY_MISSING, 'Thiếu header Idempotency-Key', 400);
    if (key.length > 255) {
      throw new DomainException(MatchingErrors.IDEMPOTENCY_CONFLICT, 'Idempotency-Key dài tối đa 255 ký tự', 400);
    }
    return key;
  }

  private hash(value: unknown): string {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }

  private deriveAge(birthDate: string | null): number {
    if (!birthDate) {
      throw new DomainException(
        MatchingErrors.PROFILE_INCOMPLETE,
        'Hồ sơ chưa có ngày sinh — cập nhật profile trước khi vào hàng đợi ghép cặp',
        422,
      );
    }
    const [year, month, day] = birthDate.split('-').map(Number);
    const now = new Date();
    let age = now.getUTCFullYear() - year;
    const monthDiff = now.getUTCMonth() + 1 - month;
    if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < day)) age -= 1;
    return age;
  }

  private toView(
    ticket: Pick<
      MatchTicket,
      'id' | 'matchType' | 'status' | 'priority' | 'matchSessionId' | 'queuedAt' | 'expiresAt'
    >,
  ): MatchTicketView {
    return {
      id: ticket.id,
      matchType: ticket.matchType,
      status: ticket.status,
      priority: ticket.priority,
      matchSessionId: ticket.matchSessionId,
      queuedAt: ticket.queuedAt,
      expiresAt: ticket.expiresAt,
    };
  }
}
