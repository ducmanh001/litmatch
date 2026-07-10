import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, LessThan, Repository } from 'typeorm';

import { enqueueTicketProjection } from './matching-queue-projection.service';
import { MatchTicket, MatchTicketStatus } from './entities/match-ticket.entity';

const SWEEPER_JOB = 'matching-ticket-sweeper';

interface ConfirmSweepOutcome {
  requeue: MatchTicket | null;
  requeuedAt: Date | null;
}

/**
 * Dọn ticket hết hạn (docs/03 § 3.8.B, docs/10 § 10.2 "ticket lacking clear state machine"):
 * - `queued` quá `MATCHING_QUEUE_MAX_WAIT_SECONDS` → expired.
 * - `matched`/`confirmed` chưa có session, quá hạn confirm → phía đã confirm được requeue lại
 *   (không bị phạt vì đã làm đúng phần của mình), phía chưa confirm bị expired.
 * KHÔNG export ra ngoài module — job nội bộ.
 *
 * TODO(M3 — Signaling Gateway): dọn "zombie ticket" khi client mất kết nối realtime thật
 * sự thuộc M3, M1 chỉ có TTL-based sweep vì chưa có kết nối socket (docs/07 Giai đoạn 2).
 */
@Injectable()
export class TicketSweeperService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(TicketSweeperService.name);
  private running = false;

  constructor(
    @InjectRepository(MatchTicket) private readonly ticketRepo: Repository<MatchTicket>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly scheduler: SchedulerRegistry,
  ) {}

  onApplicationBootstrap(): void {
    const interval = setInterval(
      () => void this.sweepOnce().catch((err) => this.logger.error({ err: `${err}` }, 'Ticket sweep lỗi')),
      this.config.getOrThrow<number>('MATCHING_SWEEPER_INTERVAL_MS'),
    );
    this.scheduler.addInterval(SWEEPER_JOB, interval);
  }

  onApplicationShutdown(): void {
    if (this.scheduler.doesExist('interval', SWEEPER_JOB)) this.scheduler.deleteInterval(SWEEPER_JOB);
  }

  /** Public để test/chạy tay (đúng pattern OutboxRelayService.flushOnce). */
  async sweepOnce(): Promise<{ expiredQueued: number; resolvedPairs: number }> {
    if (this.running) return { expiredQueued: 0, resolvedPairs: 0 };
    this.running = true;
    try {
      const expiredQueued = await this.sweepQueuedTimeouts();
      const resolvedPairs = await this.sweepConfirmTimeouts();
      return { expiredQueued, resolvedPairs };
    } finally {
      this.running = false;
    }
  }

  private async sweepQueuedTimeouts(): Promise<number> {
    const stale = await this.ticketRepo.find({
      where: { status: MatchTicketStatus.Queued, expiresAt: LessThan(new Date()) },
    });
    let count = 0;
    for (const t of stale) {
      const expired = await this.dataSource.transaction(async (manager) => {
        const result = await manager
          .createQueryBuilder()
          .update(MatchTicket)
          .set({ status: MatchTicketStatus.Expired })
          .where('id = :id AND status = :status AND expires_at < now()', {
            id: t.id,
            status: MatchTicketStatus.Queued,
          })
          .execute();
        if (!result.affected) return false;
        await enqueueTicketProjection(manager, t.id);
        return true;
      });
      if (expired) count++;
    }
    return count;
  }

  private async sweepConfirmTimeouts(): Promise<number> {
    const stale = await this.ticketRepo.find({
      where: [
        { status: MatchTicketStatus.Matched, matchSessionId: IsNull(), expiresAt: LessThan(new Date()) },
        { status: MatchTicketStatus.Confirmed, matchSessionId: IsNull(), expiresAt: LessThan(new Date()) },
      ],
    });
    const processed = new Set<string>();
    let count = 0;
    for (const t of stale) {
      if (processed.has(t.id) || !t.pairedTicketId) continue;
      processed.add(t.id);
      processed.add(t.pairedTicketId);
      const resolved = await this.resolvePair(t.id, t.pairedTicketId);
      if (resolved) count++;
    }
    return count;
  }

  /**
   * DB trước, Redis sau (commit nguồn sự thật trước khi động vào queue store — cùng tinh thần
   * outbox: không để side-effect ở store phụ chạy trước khi bước chính chắc chắn thành công).
   */
  private async resolvePair(selfId: string, partnerId: string): Promise<boolean> {
    const ids = [selfId, partnerId].sort();
    const outcome = await this.dataSource.transaction<ConfirmSweepOutcome | null>(async (manager) => {
      const repo = manager.getRepository(MatchTicket);
      const rows = await repo
        .createQueryBuilder('t')
        .setLock('pessimistic_write')
        .where('t.id IN (:...ids)', { ids })
        .orderBy('t.id', 'ASC')
        .getMany();
      const self = rows.find((r) => r.id === selfId);
      const partner = rows.find((r) => r.id === partnerId);
      if (!self || !partner) return null;
      const eligible = new Set([MatchTicketStatus.Matched, MatchTicketStatus.Confirmed]);
      // A second sweeper may have resolved this pair after our initial stale query. Re-check the
      // complete mutual-pair state under lock; never expire a ticket that was already requeued.
      if (
        self.matchSessionId ||
        partner.matchSessionId ||
        !eligible.has(self.status) ||
        !eligible.has(partner.status) ||
        self.pairedTicketId !== partner.id ||
        partner.pairedTicketId !== self.id
      ) {
        return null;
      }
      const now = new Date();
      if (self.expiresAt > now || partner.expiresAt > now) return null;

      const selfConfirmed = self.status === MatchTicketStatus.Confirmed;
      const partnerConfirmed = partner.status === MatchTicketStatus.Confirmed;

      let requeue: MatchTicket | null = null;
      let expireList: MatchTicket[];
      if (selfConfirmed && !partnerConfirmed) {
        requeue = self;
        expireList = [partner];
      } else if (partnerConfirmed && !selfConfirmed) {
        requeue = partner;
        expireList = [self];
      } else {
        // cả 2 chưa confirm kịp (hoặc trường hợp không nên xảy ra: cả 2 đã confirm mà thiếu session) → expire cả 2
        expireList = [self, partner];
      }

      let requeuedAt: Date | null = null;
      if (requeue) {
        const maxWaitSeconds = this.config.getOrThrow<number>('MATCHING_QUEUE_MAX_WAIT_SECONDS');
        requeuedAt = new Date();
        const expiresAt = new Date(requeuedAt.getTime() + maxWaitSeconds * 1000);
        await repo.update(
          { id: requeue.id },
          { status: MatchTicketStatus.Queued, pairedTicketId: null, queuedAt: requeuedAt, expiresAt },
        );
      }
      if (expireList.length > 0) {
        await repo.update({ id: In(expireList.map((t) => t.id)) }, { status: MatchTicketStatus.Expired });
      }
      await enqueueTicketProjection(manager, self.id);
      await enqueueTicketProjection(manager, partner.id);
      return { requeue, requeuedAt };
    });

    return outcome !== null;
  }
}
