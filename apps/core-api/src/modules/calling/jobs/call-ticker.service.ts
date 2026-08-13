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

import { ManagedInterval } from '../../../common/scheduling/managed-interval';
import { CallingService } from '../calling.service';
import {
  CallEndReason,
  CallSession,
  CallSessionStatus,
} from '../entities/call-session.entity';
import type { CoreApiEnv } from '../../../config/env.validation';

const TICKER_JOB = 'calling-ticker';
/** Giới hạn vận hành; backlog sẽ được xử lý dần qua các tick tiếp theo. */
const TICK_BATCH_SIZE = 100;

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

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService<CoreApiEnv, true>,
    private readonly scheduler: SchedulerRegistry,
    private readonly callingService: CallingService,
  ) {}

  onApplicationBootstrap(): void {
    this.job.start(this.scheduler, {
      jobName: TICKER_JOB,
      intervalMs: this.config.getOrThrow('CALLING_TICKER_INTERVAL_MS', {
        infer: true,
      }),
      task: () => this.runOnce(),
      logger: this.logger,
      errorMessage: 'Call ticker tick lỗi',
      clusterSingleton: { dataSource: this.dataSource },
    });
  }

  onApplicationShutdown(): void {
    this.job.stop();
  }

  /** 1 tick — public để test/chạy tay. */
  async runOnce(): Promise<void> {
    await this.job.runExclusive(async () => {
      // Bọc span thủ công — tick không có parent context tự nhiên.
      await withSpan('litmatch.calling', 'calling.ticker.tick', async () => {
        await this.sweepPending();
        await this.sweepReconnectTimeouts();
        await this.processActiveCalls();
      });
    }, undefined);
  }

  private async sweepPending(): Promise<void> {
    const timeoutSeconds = this.config.getOrThrow(
      'CALLING_PENDING_TIMEOUT_SECONDS',
      { infer: true },
    );
    const cutoff = new Date(Date.now() - timeoutSeconds * 1000);
    const stale = await this.dataSource.getRepository(CallSession).find({
      select: { id: true },
      where: { status: CallSessionStatus.Pending, createdAt: LessThan(cutoff) },
      order: { createdAt: 'ASC', id: 'ASC' },
      take: TICK_BATCH_SIZE,
    });
    for (const call of stale) {
      await this.callingService.endById(call.id, CallEndReason.PendingTimeout);
    }
  }

  private async sweepReconnectTimeouts(): Promise<void> {
    const reconnectSeconds = this.config.getOrThrow(
      'CALLING_RECONNECT_WINDOW_SECONDS',
      { infer: true },
    );
    const cutoff = new Date(Date.now() - reconnectSeconds * 1000);
    const stale = await this.dataSource.getRepository(CallSession).find({
      select: { id: true },
      where: {
        status: CallSessionStatus.Active,
        reconnectStartedAt: LessThan(cutoff),
      },
      order: { reconnectStartedAt: 'ASC', id: 'ASC' },
      take: TICK_BATCH_SIZE,
    });
    for (const call of stale) {
      await this.callingService.endById(call.id, CallEndReason.Completed);
    }
  }

  private async processActiveCalls(): Promise<void> {
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
      .orderBy('call.updated_at', 'ASC')
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

    const active = await activeQuery.getMany();
    for (const call of active) {
      await this.callingService
        .endById(call.id, CallEndReason.FreeLimit)
        .catch((err) =>
          this.logger.error(
            { err: `${err}` },
            `Xử lý call active ${call.id} lỗi — thử lại ở tick sau`,
          ),
        );
    }
  }
}
