import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In } from 'typeorm';

import { ManagedInterval } from '../../../common/scheduling/managed-interval';
import { requeueIdempotencyKey } from '../matching.constants';
import {
  MatchTicket,
  MatchTicketStatus,
} from '../entities/match-ticket.entity';
import {
  MatchSession,
  MatchSessionStatus,
} from '../entities/match-session.entity';
import {
  MATCHING_ACTIVE_SHARDS_KEY,
  MATCHING_REDIS,
  matchingShardKey,
  ticketScore,
} from '../redis/matching-redis.provider';

import type Redis from 'ioredis';
import type { CoreApiEnv } from '../../../config/env.validation';

const SWEEPER_JOB = 'matching-ticket-sweeper';
/** Giới hạn số session xử lý mỗi tick — batch vận hành nội bộ, không phải rule nghiệp vụ. */
const SESSION_SWEEP_BATCH = 200;

/**
 * Sweeper (docs/services/matching-service.md § 3) — chốt chặn cuối cho "zombie" chiếm chỗ
 * trong hàng đợi (docs/10 § Matching):
 * - `queued` quá MATCHING_QUEUE_MAX_WAIT_SECONDS → expired + ZREM Redis (idempotent).
 * - session `pending_confirm` quá MATCHING_CONFIRM_TIMEOUT_SECONDS chưa đủ 2 confirm →
 *   session expired; bên ĐÃ confirm được requeue bằng ticket MỚI (enqueue mới, priority mới —
 *   spec § 3; transition matched→queued không tồn tại trong state machine § 1 nên không tái dùng
 *   ticket cũ); bên chưa confirm → expired.
 * Interval từ config → đăng ký qua SchedulerRegistry (cùng pattern OutboxRelayService).
 */
@Injectable()
export class TicketSweeperService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(TicketSweeperService.name);
  private readonly job = new ManagedInterval();

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService<CoreApiEnv, true>,
    private readonly scheduler: SchedulerRegistry,
    @Inject(MATCHING_REDIS) private readonly redis: Redis,
  ) {}

  onApplicationBootstrap(): void {
    this.job.start(this.scheduler, {
      jobName: SWEEPER_JOB,
      intervalMs: this.config.getOrThrow('MATCHING_SWEEPER_INTERVAL_MS', {
        infer: true,
      }),
      task: () => this.runOnce(),
      logger: this.logger,
      errorMessage: 'Sweeper tick lỗi',
    });
  }

  onApplicationShutdown(): void {
    this.job.stop();
  }

  /** 1 tick — public để test/chạy tay. */
  async runOnce(): Promise<{ expiredQueued: number; expiredSessions: number }> {
    return this.job.runExclusive(
      async () => {
        const expiredQueued = await this.expireStaleQueuedTickets();
        const expiredSessions = await this.expireStalePendingSessions();
        return { expiredQueued, expiredSessions };
      },
      { expiredQueued: 0, expiredSessions: 0 },
    );
  }

  /**
   * UPDATE có điều kiện status='queued' là transition atomic queued→expired: ticket đang bị
   * matcher lock FOR UPDATE sẽ chờ, và nếu matcher vừa chuyển sang matched thì WHERE không còn
   * khớp — không bao giờ expire nhầm ticket vừa được ghép.
   * Mốc tính hạn là enqueued_at (không phải created_at): ticket requeue sau confirm-timeout
   * là ticket MỚI nên enqueued_at = created_at; dùng enqueued_at để nhất quán ngữ nghĩa "chờ từ lúc vào queue".
   */
  private async expireStaleQueuedTickets(): Promise<number> {
    const maxWaitSeconds = this.config.getOrThrow(
      'MATCHING_QUEUE_MAX_WAIT_SECONDS',
      { infer: true },
    );
    // TypeORM query() cho UPDATE trả [rows, rowCount] (không phải rows trần như SELECT)
    const [rows] = (await this.dataSource.query(
      `UPDATE match_tickets
          SET status = $1, updated_at = now()
        WHERE status = $2 AND enqueued_at < now() - make_interval(secs => $3)
        RETURNING id, match_type, region, age_band`,
      [MatchTicketStatus.Expired, MatchTicketStatus.Queued, maxWaitSeconds],
    )) as [
      Array<{
        id: string;
        match_type: string;
        region: string;
        age_band: number;
      }>,
      number,
    ];
    for (const row of rows) {
      // ZREM idempotent — ticketId không còn trong sorted set (đã bị pop) thì bỏ qua (spec § 3)
      await this.redis.zrem(
        matchingShardKey(row.match_type, row.region, row.age_band),
        row.id,
      );
    }
    return rows.length;
  }

  private async expireStalePendingSessions(): Promise<number> {
    const timeoutSeconds = this.config.getOrThrow(
      'MATCHING_CONFIRM_TIMEOUT_SECONDS',
      { infer: true },
    );
    const stale = await this.dataSource
      .getRepository(MatchSession)
      .createQueryBuilder('s')
      .select(['s.id'])
      .where(
        's.status = :status AND s.created_at < now() - make_interval(secs => :timeoutSeconds)',
        {
          status: MatchSessionStatus.PendingConfirm,
          timeoutSeconds,
        },
      )
      .orderBy('s.created_at', 'ASC')
      .limit(SESSION_SWEEP_BATCH)
      .getMany();

    let expired = 0;
    for (const { id } of stale) {
      if (await this.expireSession(id)) expired += 1;
    }
    return expired;
  }

  /** Expire 1 session quá hạn confirm — mỗi session 1 transaction riêng, lock session → tickets. */
  private async expireSession(sessionId: string): Promise<boolean> {
    const toEnqueue: MatchTicket[] = [];
    const done = await this.dataSource.transaction(async (manager) => {
      const session = await manager.findOne(MatchSession, {
        where: { id: sessionId },
        lock: { mode: 'pessimistic_write' },
      });
      // user có thể vừa confirm đủ 2 bên giữa lúc sweeper quét — re-check dưới lock (docs/10 § 10.0.C)
      if (!session || session.status !== MatchSessionStatus.PendingConfirm)
        return false;

      const tickets = await manager.find(MatchTicket, {
        where: { id: In([session.ticketAId, session.ticketBId]) },
        order: { id: 'ASC' },
        lock: { mode: 'pessimistic_write' },
      });
      for (const ticket of tickets) {
        if (ticket.status !== MatchTicketStatus.Matched) continue; // trạng thái lạ — không đụng
        const hasConfirmed =
          (ticket.id === session.ticketAId && session.confirmedAAt !== null) ||
          (ticket.id === session.ticketBId && session.confirmedBAt !== null);

        ticket.status = MatchTicketStatus.Expired; // matched→expired (state machine § 1)
        await manager.save(ticket);

        if (hasConfirmed) {
          // Bên đã confirm không mất lượt: requeue bằng ticket MỚI, enqueue mới + priority mới (spec § 3).
          // Idempotency key tất định theo (session, ticket cũ) — sweeper chạy lại không tạo ticket đôi.
          const requeued = await manager.save(
            manager.create(MatchTicket, {
              userId: ticket.userId,
              matchType: ticket.matchType,
              region: ticket.region,
              ageBand: ticket.ageBand,
              genderPreference: ticket.genderPreference, // requeue giữ nguyên lựa chọn của user
              status: MatchTicketStatus.Queued,
              enqueuedAt: new Date(),
              priorityBoostMs: 0,
              sessionId: null,
              idempotencyKey: requeueIdempotencyKey(session.id, ticket.id),
            }),
          );
          toEnqueue.push(requeued);
        }
      }

      session.status = MatchSessionStatus.Expired;
      session.endedAt = new Date();
      await manager.save(session);
      return true;
    });

    // Redis SAU khi DB commit — nếu fail, ticket requeue là zombie DB, chính sweeper này expire nó khi quá hạn
    for (const ticket of toEnqueue) {
      const shard = matchingShardKey(
        ticket.matchType,
        ticket.region,
        ticket.ageBand,
      );
      await this.redis.zadd(
        shard,
        'NX',
        String(ticketScore(ticket)),
        ticket.id,
      );
      await this.redis.sadd(MATCHING_ACTIVE_SHARDS_KEY, shard);
    }
    return done;
  }
}
