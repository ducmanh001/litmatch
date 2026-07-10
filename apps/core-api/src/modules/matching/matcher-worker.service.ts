import { randomUUID } from 'node:crypto';

import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';

import { MatchingQueueStore, QueueMember } from './redis/matching-queue.script';
import { enqueueTicketProjection } from './matching-queue-projection.service';
import { MatchTicket, MatchTicketStatus } from './entities/match-ticket.entity';

const MATCHER_JOB = 'matching-matcher-worker';

class PairRaceError extends Error {
  constructor(readonly staleId: string) {
    super('MATCHING_PAIR_RACE');
  }
}

/**
 * Matcher worker — stateless, chạy nhiều instance song song được (docs/03 § 3.8.B).
 * KHÔNG export ra ngoài module: chỉ là job nội bộ của Matching.
 *
 * TODO(Giai đoạn 4 — Report/Block): chưa có bảng Block/Report nên chưa re-check "đã report/block
 * nhau chưa" tại thời điểm ghép cặp — bổ sung khi module Social có bảng này (docs/07 Giai đoạn 4).
 */
@Injectable()
export class MatcherWorkerService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(MatcherWorkerService.name);
  private running = false;

  constructor(
    @InjectRepository(MatchTicket) private readonly ticketRepo: Repository<MatchTicket>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly queue: MatchingQueueStore,
    private readonly scheduler: SchedulerRegistry,
  ) {}

  onApplicationBootstrap(): void {
    const interval = setInterval(
      () => void this.tickOnce().catch((err) => this.logger.error({ err: `${err}` }, 'Matcher tick lỗi')),
      this.config.getOrThrow<number>('MATCHING_MATCHER_INTERVAL_MS'),
    );
    this.scheduler.addInterval(MATCHER_JOB, interval);
  }

  onApplicationShutdown(): void {
    if (this.scheduler.doesExist('interval', MATCHER_JOB)) this.scheduler.deleteInterval(MATCHER_JOB);
  }

  /** 1 vòng quét toàn bộ shard đang active — public để test/chạy tay (đúng pattern OutboxRelayService). */
  async tickOnce(): Promise<number> {
    if (this.running) return 0; // vòng trước chưa xong thì bỏ qua, không chồng lượt
    this.running = true;
    try {
      const shards = await this.queue.listActiveShards();
      let paired = 0;
      for (const shardKey of shards) {
        paired += await this.processShard(shardKey);
      }
      return paired;
    } finally {
      this.running = false;
    }
  }

  private async processShard(shardKey: string): Promise<number> {
    const batchSize = this.config.getOrThrow<number>('MATCHING_MATCHER_BATCH_SIZE');
    const leaseOwner = randomUUID();
    // Atomic claim with lease: another worker cannot take the ticket, while a crashed worker's
    // reservation expires and is recoverable instead of destructively losing the batch.
    const members = await this.queue.claimBatch(shardKey, batchSize, leaseOwner);
    if (members.length < 2) {
      await this.queue.releaseClaims(shardKey, members);
      return 0;
    }

    try {
      const tickets = await this.ticketRepo.findBy({ id: In(members.map((m) => m.ticketId)) });
      const aliveById = new Map(
        tickets.filter((ticket) => ticket.status === MatchTicketStatus.Queued).map((ticket) => [ticket.id, ticket]),
      );
      const memberById = new Map(members.map((member) => [member.ticketId, member]));
      const consumed = new Set<string>();
      const release: QueueMember[] = [];
      const ack: QueueMember[] = members.filter((member) => !aliveById.has(member.ticketId));
      let pairedCount = 0;

      for (const a of members) {
        if (consumed.has(a.ticketId)) continue;
        const ticketA = aliveById.get(a.ticketId);
        if (!ticketA) continue;

        let ticketB: MatchTicket | undefined;
        for (const b of members) {
          if (b.ticketId === a.ticketId || consumed.has(b.ticketId)) continue;
          const candidate = aliveById.get(b.ticketId);
          if (candidate && this.isCompatible(ticketA, candidate)) {
            ticketB = candidate;
            break;
          }
        }

        if (!ticketB) {
          release.push(a);
          continue;
        }
        consumed.add(a.ticketId);
        consumed.add(ticketB.id);

        const result = await this.tryPair(ticketA, ticketB);
        if (result.staleId === null) {
          pairedCount++;
          ack.push(a, memberById.get(ticketB.id) as QueueMember);
        } else {
          const stale = memberById.get(result.staleId);
          if (stale) ack.push(stale);
          const survivorId = ticketA.id === result.staleId ? ticketB.id : ticketA.id;
          const survivor = memberById.get(survivorId);
          if (survivor) release.push(survivor);
        }
      }

      await this.queue.ackClaims(shardKey, ack);
      await this.queue.releaseClaims(shardKey, release);
      return pairedCount;
    } catch (err) {
      // Safe even if an earlier pair committed: Postgres validation/outbox removes stale members.
      await this.queue.releaseClaims(shardKey, members);
      throw err;
    }
  }

  /** Tiêu chí lọc cơ bản tuổi/giới tính, kiểm 2 chiều (docs/03 § 3.8.B, docs/06). */
  private isCompatible(a: MatchTicket, b: MatchTicket): boolean {
    return (
      this.genderMatches(a.criteria.genderPref, b.ownGender) &&
      this.genderMatches(b.criteria.genderPref, a.ownGender) &&
      b.ownAge >= a.criteria.minAge &&
      b.ownAge <= a.criteria.maxAge &&
      a.ownAge >= b.criteria.minAge &&
      a.ownAge <= b.criteria.maxAge
    );
  }

  private genderMatches(pref: string, gender: string): boolean {
    return pref === 'any' || pref === gender;
  }

  /**
   * Conditional UPDATE cả 2 ticket trong 1 transaction, khoá theo thứ tự id cố định (tránh deadlock).
   * `staleId: null` = ghép thành công; ngược lại là id của ticket đã rời trạng thái `queued`.
   */
  private async tryPair(a: MatchTicket, b: MatchTicket): Promise<{ staleId: string | null }> {
    const [first, second] = a.id < b.id ? [a, b] : [b, a];
    const partnerIdOf = (t: MatchTicket): string => (t.id === a.id ? b.id : a.id);
    // matched → confirmed KHÔNG tự động (docs/03 § 3.8.B) — reset expiresAt thành hạn confirm,
    // ticket-sweeper.service.ts dọn nếu 1 trong 2 phía không confirm kịp.
    const confirmTimeoutSeconds = this.config.getOrThrow<number>('MATCHING_CONFIRM_TIMEOUT_SECONDS');
    const confirmDeadline = new Date(Date.now() + confirmTimeoutSeconds * 1000);
    try {
      await this.dataSource.transaction(async (manager) => {
        for (const t of [first, second]) {
          const result = await manager
            .createQueryBuilder()
            .update(MatchTicket)
            .set({ status: MatchTicketStatus.Matched, pairedTicketId: partnerIdOf(t), expiresAt: confirmDeadline })
            .where('id = :id AND status = :status', { id: t.id, status: MatchTicketStatus.Queued })
            .execute();
          if (!result.affected) throw new PairRaceError(t.id);
        }
        await enqueueTicketProjection(manager, a.id);
        await enqueueTicketProjection(manager, b.id);
      });
      return { staleId: null };
    } catch (err) {
      if (err instanceof PairRaceError) return { staleId: err.staleId };
      throw err;
    }
  }
}
