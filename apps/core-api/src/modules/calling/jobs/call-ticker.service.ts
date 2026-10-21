import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { withSpan } from '@litmatch/observability';
import { DataSource, LessThan } from 'typeorm';
import type { FindManyOptions, SelectQueryBuilder } from 'typeorm';

import { ManagedInterval } from '../../../common/scheduling/managed-interval';
import { CallingService } from '../calling.service';
import {
  CallEndReason,
  CallKind,
  CallSession,
  CallSessionStatus,
} from '../entities/call-session.entity';
import type { CoreApiEnv } from '../../../config/env.validation';

const TICKER_JOB = 'calling-ticker';
const CLEANUP_JOB = 'calling-cleanup';
const CLEANUP_FAILURE_BACKOFF_MS = 5_000;
/** Giới hạn vận hành; backlog sẽ được xử lý dần qua các tick tiếp theo. */
const TICK_BATCH_SIZE = 100;

interface ClaimedCall {
  id: string;
  endReason: CallEndReason | null;
  claimUntil: string;
}

/**
 * Timer của Voice Match — TẤT CẢ enforce ở server, không tin timer client
 * (docs/10 § Calling; docs/services/calling-service.md § 4):
 * - pending quá CALLING_PENDING_TIMEOUT_SECONDS → end pending_timeout.
 * - active voice match quá CALLING_FREE_CALL_SECONDS → end free_limit.
 * - Friend call không đi qua free timer; hai người đã mutual like có thể gọi lại lâu dài.
 * Stateless — chạy được nhiều instance (idempotency + lock là nguồn an toàn, không phải "chỉ 1 pod").
 */
@Injectable()
export class CallTickerService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(CallTickerService.name);
  private readonly job = new ManagedInterval();
  private readonly cleanupJob = new ManagedInterval();
  private stopping = false;
  private nextSweep = 0;
  private cleanupRetryAfter = 0;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService<CoreApiEnv, true>,
    private readonly scheduler: SchedulerRegistry,
    private readonly callingService: CallingService,
  ) {}

  onApplicationBootstrap(): void {
    this.stopping = false;
    this.cleanupRetryAfter = 0;
    this.job.start(this.scheduler, {
      jobName: TICKER_JOB,
      intervalMs: this.config.getOrThrow('CALLING_TICKER_INTERVAL_MS', {
        infer: true,
      }),
      task: () => this.runOnce(),
      logger: this.logger,
      errorMessage: 'Call ticker tick lỗi',
      databaseAdmission: { dataSource: this.dataSource, priority: 'critical' },
    });
    this.cleanupJob.start(this.scheduler, {
      jobName: CLEANUP_JOB,
      intervalMs: this.config.getOrThrow('CALLING_TICKER_INTERVAL_MS', {
        infer: true,
      }),
      task: () => this.runCleanupOnce(),
      logger: this.logger,
      errorMessage: 'Call cleanup tick lỗi',
      databaseAdmission: { dataSource: this.dataSource },
    });
  }

  onApplicationShutdown(): void {
    this.stopping = true;
    this.job.stop();
    this.cleanupJob.stop();
  }

  /** 1 tick — public để test/chạy tay. */
  async runOnce(): Promise<void> {
    await this.job.runExclusive(async () => {
      // Bọc span thủ công — tick không có parent context tự nhiên.
      await withSpan('litmatch.calling', 'calling.ticker.tick', async () => {
        const deadline = this.tickDeadline();
        const sweeps = [
          () => this.sweepPending(deadline),
          () => this.sweepReconnectTimeouts(deadline),
          () => this.processActiveCalls(deadline),
        ];
        // Rotate the next stage when a slow stage exhausts its budget; pending backlog must not starve free limits.
        for (let i = 0; i < sweeps.length && this.canContinue(deadline); i++) {
          const sweep = sweeps[this.nextSweep];
          this.nextSweep = (this.nextSweep + 1) % sweeps.length;
          await sweep();
        }
      });
    }, undefined);
  }

  private async sweepPending(deadline: number): Promise<void> {
    const timeoutSeconds = this.config.getOrThrow(
      'CALLING_PENDING_TIMEOUT_SECONDS',
      { infer: true },
    );
    const cutoff = new Date(Date.now() - timeoutSeconds * 1000);
    const stale = await this.selectCandidates({
      select: { id: true },
      where: { status: CallSessionStatus.Pending, createdAt: LessThan(cutoff) },
      order: { createdAt: 'ASC', id: 'ASC' },
      take: TICK_BATCH_SIZE,
    });
    let attempted = 0;
    try {
      for (const call of stale) {
        if (!this.canStartCandidate(deadline, attempted)) break;
        attempted++;
        await this.callingService.endById(
          call.id,
          CallEndReason.PendingTimeout,
          (current) =>
            current.status === CallSessionStatus.Pending &&
            current.createdAt < cutoff,
          { deferCleanup: true, skipLocked: true },
        );
      }
    } finally {
      await this.releaseUnused(stale, 'timer_claim_until');
    }
  }

  private async sweepReconnectTimeouts(deadline: number): Promise<void> {
    const reconnectSeconds = this.config.getOrThrow(
      'CALLING_RECONNECT_WINDOW_SECONDS',
      { infer: true },
    );
    const cutoff = new Date(Date.now() - reconnectSeconds * 1000);
    const stale = await this.selectCandidates({
      select: { id: true },
      where: {
        status: CallSessionStatus.Active,
        reconnectStartedAt: LessThan(cutoff),
      },
      order: { reconnectStartedAt: 'ASC', id: 'ASC' },
      take: TICK_BATCH_SIZE,
    });
    let attempted = 0;
    try {
      for (const call of stale) {
        if (!this.canStartCandidate(deadline, attempted)) break;
        attempted++;
        await this.callingService.endById(
          call.id,
          CallEndReason.Completed,
          (current) =>
            current.status === CallSessionStatus.Active &&
            current.reconnectStartedAt !== null &&
            current.reconnectStartedAt < cutoff,
          { deferCleanup: true, skipLocked: true },
        );
      }
    } finally {
      await this.releaseUnused(stale, 'timer_claim_until');
    }
  }

  private async processActiveCalls(deadline: number): Promise<void> {
    const freeSeconds = this.config.getOrThrow('CALLING_FREE_CALL_SECONDS', {
      infer: true,
    });
    const activeQuery = this.dataSource
      .getRepository(CallSession)
      .createQueryBuilder('call')
      .select(['call.id'])
      .where('call.status = :status', { status: CallSessionStatus.Active })
      .andWhere('call.reconnect_started_at IS NULL')
      .andWhere('call.started_at IS NOT NULL')
      .orderBy('call.started_at', 'ASC')
      .addOrderBy('call.id', 'ASC')
      .take(TICK_BATCH_SIZE);

    // Friend calls have no Voice Match free-window. The source column is added
    // by the friend-call migration; legacy rows are Voice Match by default.
    activeQuery
      .andWhere("call.call_kind = 'voice_match'")
      .andWhere(
        'call.started_at <= now() - make_interval(secs => :freeSeconds)',
        { freeSeconds },
      );

    const active = await this.claimCandidates(activeQuery, 'timer_claim_until');
    let attempted = 0;
    for (const call of active) {
      if (!this.canStartCandidate(deadline, attempted)) break;
      attempted++;
      await this.callingService
        .endById(
          call.id,
          CallEndReason.FreeLimit,
          (current) =>
            current.status === CallSessionStatus.Active &&
            current.callKind === CallKind.VoiceMatch &&
            current.reconnectStartedAt === null &&
            current.startedAt !== null &&
            current.startedAt.getTime() <= Date.now() - freeSeconds * 1000,
          { deferCleanup: true, skipLocked: true },
        )
        .catch((err) =>
          this.logger.error(
            { err: `${err}` },
            `Xử lý call active ${call.id} lỗi — thử lại ở tick sau`,
          ),
        );
    }
    await this.releaseUnused(active, 'timer_claim_until');
  }

  /** Independent lifecycle: a slow SFU must never occupy the server timer's runExclusive gate. */
  async runCleanupOnce(): Promise<void> {
    await this.cleanupJob.runExclusive(async () => {
      if (this.stopping || Date.now() < this.cleanupRetryAfter) return;
      const deadline = this.tickDeadline();
      const pending = await this.selectCandidates(
        {
          select: { id: true, endReason: true },
          where: { status: CallSessionStatus.Ended, cleanupPending: true },
          order: { updatedAt: 'ASC', id: 'ASC' },
          take: TICK_BATCH_SIZE,
        },
        'cleanup_claim_until',
      );
      const concurrency = Math.min(
        this.config.getOrThrow('CALLING_CLEANUP_CONCURRENCY', { infer: true }),
        Math.max(
          1,
          Math.floor(
            this.config.getOrThrow('DATABASE_POOL_MAX', { infer: true }) / 4,
          ),
        ),
        pending.length,
      );
      let next = 0;
      let failures = 0;
      await Promise.all(
        Array.from({ length: concurrency }, async () => {
          while (
            next < pending.length &&
            this.canStartCandidate(deadline, next)
          ) {
            const call = pending[next++];
            try {
              const result = await this.callingService.endById(
                call.id,
                call.endReason ?? CallEndReason.Completed,
                undefined,
                { skipLocked: true },
              );
              if (result.call?.cleanupPending) failures++;
            } catch (error) {
              failures++;
              this.logger.error(
                { err: `${error}` },
                `Cleanup call ${call.id} lỗi — thử lại ở tick sau`,
              );
            }
          }
        }),
      );
      await this.releaseUnused(pending, 'cleanup_claim_until');
      if (next > 0 && failures === next) {
        // All attempts failed: avoid hammering the same dependency once per second during an outage.
        this.cleanupRetryAfter =
          Date.now() + CLEANUP_FAILURE_BACKOFF_MS * (0.5 + Math.random() * 0.5);
      }
    }, undefined);
  }

  private tickDeadline(): number {
    return (
      Date.now() +
      this.config.getOrThrow('CALLING_TICK_BUDGET_MS', { infer: true })
    );
  }

  private selectCandidates(
    options: FindManyOptions<CallSession>,
    claimColumn:
      'timer_claim_until' | 'cleanup_claim_until' = 'timer_claim_until',
  ): Promise<ClaimedCall[]> {
    return this.claimCandidates(
      this.dataSource
        .getRepository(CallSession)
        .createQueryBuilder('call')
        .setFindOptions(options),
      claimColumn,
    );
  }

  private async claimCandidates(
    query: SelectQueryBuilder<CallSession>,
    claimColumn: 'timer_claim_until' | 'cleanup_claim_until',
  ): Promise<ClaimedCall[]> {
    // Selection and claim are one statement: replicas get disjoint batches even after row locks
    // are released. A crashed worker loses its claim automatically by the database clock.
    const [sql, parameters] = query
      .select('call.id', 'id')
      .andWhere(
        `(call.${claimColumn} IS NULL OR call.${claimColumn} <= clock_timestamp())`,
      )
      .setLock('pessimistic_write')
      .setOnLocked('skip_locked')
      .getQueryAndParameters();
    const leaseMs = this.config.getOrThrow('CALLING_JOB_LEASE_MS', {
      infer: true,
    });
    return this.dataSource.query(
      `WITH candidates AS (${sql}), claims AS (
       UPDATE call_sessions claimed
          SET ${claimColumn} = clock_timestamp() + ($${parameters.length + 1}::double precision * interval '1 millisecond')
         FROM candidates
        WHERE claimed.id = candidates.id
       RETURNING claimed.id, claimed.end_reason AS "endReason", claimed.${claimColumn}::text AS "claimUntil"
       ) SELECT * FROM claims`,
      [...parameters, leaseMs],
    ) as Promise<ClaimedCall[]>;
  }

  private async releaseUnused(
    calls: ClaimedCall[],
    claimColumn: 'timer_claim_until' | 'cleanup_claim_until',
  ): Promise<void> {
    if (calls.length === 0) return;
    // Settled/skipped attempts should retry next tick; only crashes wait for lease expiry.
    // Compare the exact DB timestamp so a delayed release cannot revoke a newer worker's lease.
    await this.dataSource.query(
      `UPDATE call_sessions c SET ${claimColumn} = NULL
         FROM jsonb_to_recordset($1::jsonb) AS unused(id uuid, "claimUntil" timestamptz)
        WHERE c.id = unused.id AND c.${claimColumn} = unused."claimUntil"`,
      [JSON.stringify(calls.map(({ id, claimUntil }) => ({ id, claimUntil })))],
    );
  }

  private canContinue(deadline: number): boolean {
    return !this.stopping && Date.now() < deadline;
  }

  private canStartCandidate(deadline: number, attempted: number): boolean {
    // A successful slow SELECT must still make progress; shutdown always wins over this allowance.
    return !this.stopping && (attempted === 0 || Date.now() < deadline);
  }
}
