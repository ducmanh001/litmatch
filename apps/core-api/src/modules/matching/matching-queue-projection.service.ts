import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';

import { MatchTicket, MatchTicketStatus } from './entities/match-ticket.entity';
import { MatchingQueueOutbox } from './entities/matching-queue-outbox.entity';
import { MatchingQueueStore } from './redis/matching-queue.script';

const PROJECTION_JOB = 'matching-queue-projection';
const FULL_RECONCILE_INTERVAL_MS = 60_000;

export async function enqueueTicketProjection(manager: EntityManager, ticketId: string): Promise<void> {
  await manager.save(manager.create(MatchingQueueOutbox, { ticketId }));
}

/** Transactional-outbox relay that makes Redis a repairable projection of MatchTicket. */
@Injectable()
export class MatchingQueueProjectionService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(MatchingQueueProjectionService.name);
  private running = false;
  private lastFullReconcileAt = 0;

  constructor(
    @InjectRepository(MatchTicket) private readonly ticketRepo: Repository<MatchTicket>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly queue: MatchingQueueStore,
    private readonly config: ConfigService,
    private readonly scheduler: SchedulerRegistry,
  ) {}

  onApplicationBootstrap(): void {
    void this.flushOnce(true).catch((err) => this.logger.error({ err: `${err}` }, 'Queue projection bootstrap lỗi'));
    const interval = setInterval(
      () => void this.flushOnce().catch((err) => this.logger.error({ err: `${err}` }, 'Queue projection relay lỗi')),
      this.config.getOrThrow<number>('MATCHING_MATCHER_INTERVAL_MS'),
    );
    this.scheduler.addInterval(PROJECTION_JOB, interval);
  }

  onApplicationShutdown(): void {
    if (this.scheduler.doesExist('interval', PROJECTION_JOB)) this.scheduler.deleteInterval(PROJECTION_JOB);
  }

  async flushOnce(forceFullReconcile = false): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const processed = await this.flushPendingBatch();
      const now = Date.now();
      if (forceFullReconcile || now - this.lastFullReconcileAt >= FULL_RECONCILE_INTERVAL_MS) {
        await this.reconcileQueued();
        this.lastFullReconcileAt = now;
      }
      return processed;
    } finally {
      this.running = false;
    }
  }

  private async flushPendingBatch(): Promise<number> {
    const batchSize = this.config.getOrThrow<number>('MATCHING_QUEUE_OUTBOX_BATCH_SIZE');
    return this.dataSource.transaction(async (manager) => {
      const outboxRepo = manager.getRepository(MatchingQueueOutbox);
      const events = await outboxRepo
        .createQueryBuilder('event')
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .where('event.processed_at IS NULL')
        .orderBy('event.created_at', 'ASC')
        .take(batchSize)
        .getMany();

      for (const event of events) {
        const ticket = await manager.getRepository(MatchTicket).findOneBy({ id: event.ticketId });
        if (ticket) await this.queue.project(ticket);
        event.processedAt = new Date();
        event.attempts += 1;
      }
      if (events.length > 0) await outboxRepo.save(events);
      return events.length;
    });
  }

  /** Repairs processed-outbox loss after Redis restart; queue wait TTL bounds this result set. */
  private async reconcileQueued(): Promise<void> {
    let lastId = '';
    for (;;) {
      const qb = this.ticketRepo
        .createQueryBuilder('ticket')
        .where('ticket.status = :status', { status: MatchTicketStatus.Queued })
        .orderBy('ticket.id', 'ASC')
        .take(500);
      if (lastId) qb.andWhere('ticket.id > :lastId', { lastId });
      const rows = await qb.getMany();
      for (const ticket of rows) await this.queue.project(ticket);
      if (rows.length < 500) break;
      lastId = rows[rows.length - 1].id;
    }
  }
}
