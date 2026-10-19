import type {
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { SchedulerRegistry } from '@nestjs/schedule';
import type { Meter } from '@opentelemetry/api';
import type { DataSource } from 'typeorm';

import { ManagedInterval } from '../scheduling/managed-interval';
import { purgeInBatches } from './batched-purge';
import { recordRetention } from './retention-metrics';

import type { CoreApiEnv } from '../../config/env.validation';
import type { PurgeResult, PurgeStep } from './batched-purge';

/**
 * Trần thời gian một tick (ms): cluster-singleton giữ một transaction + một kết nối pool suốt tick, nên tick
 * không được kéo dài vô hạn (tránh `idle_in_transaction_session_timeout`, giữ kết nối pool). Hết ngân sách thì
 * dừng ở ranh giới lô; backlog còn lại để tick sau.
 */
const RETENTION_TICK_BUDGET_MS = 30_000;

/**
 * Khung chung cho job retention (ADR 0013). Module sở hữu bảng khai báo `steps()` (SQL của nó, theo
 * ranh giới module ADR 0012); khung lo vòng đời, chọn chế độ, giới hạn lô, log và metric.
 *
 * - `RETENTION_MODE=off` (mặc định): không đăng ký interval, không tốn tài nguyên.
 * - Cluster singleton bằng advisory lock: nhiều pod chỉ một pod chạy mỗi tick.
 * - Mỗi tick xử lý tối đa `RETENTION_BATCH_SIZE × RETENTION_MAX_BATCHES_PER_TICK` hàng mỗi quy tắc;
 *   backlog được xử lý dần ở các tick sau (không giữ transaction/khoá dài).
 */
export abstract class RetentionJob
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly job = new ManagedInterval();
  private stopping = false;
  /** Quy tắc bắt đầu của tick kế tiếp — xoay vòng để một backlog lớn không bỏ đói các quy tắc sau. */
  private rotation = 0;

  protected abstract readonly jobName: string;
  protected abstract readonly logger: Logger;

  protected constructor(
    protected readonly dataSource: DataSource,
    protected readonly config: ConfigService<CoreApiEnv, true>,
    private readonly scheduler: SchedulerRegistry,
    private readonly meter: Meter,
  ) {}

  /** Các quy tắc xoá của module (rỗng khi mọi số ngày = 0, tức giữ vĩnh viễn). */
  protected abstract steps(): PurgeStep[];

  onApplicationBootstrap(): void {
    if (this.config.getOrThrow('RETENTION_MODE', { infer: true }) === 'off') {
      return;
    }
    this.job.start(this.scheduler, {
      jobName: this.jobName,
      intervalMs: this.config.getOrThrow('RETENTION_INTERVAL_MS', {
        infer: true,
      }),
      task: () => this.runOnce(),
      logger: this.logger,
      errorMessage: `Job retention ${this.jobName} lỗi`,
      skipWhenIdle: true,
      clusterSingleton: { dataSource: this.dataSource },
    });
  }

  onApplicationShutdown(): void {
    // Lô đang chạy xong rồi dừng; không bắt đầu lô/quy tắc mới.
    this.stopping = true;
    this.job.stop();
  }

  /** 1 tick — public để test/chạy tay. */
  async runOnce(): Promise<PurgeResult[]> {
    return this.job.runExclusive(async () => {
      const mode = this.config.getOrThrow('RETENTION_MODE', { infer: true });
      if (mode === 'off') return [];
      const options = {
        mode,
        batchSize: this.config.getOrThrow('RETENTION_BATCH_SIZE', {
          infer: true,
        }),
        maxBatches: this.config.getOrThrow('RETENTION_MAX_BATCHES_PER_TICK', {
          infer: true,
        }),
        pauseMs: this.config.getOrThrow('RETENTION_BATCH_PAUSE_MS', {
          infer: true,
        }),
      };
      const intervalMs = this.config.getOrThrow('RETENTION_INTERVAL_MS', {
        infer: true,
      });
      const deadlineAt =
        Date.now() + Math.min(RETENTION_TICK_BUDGET_MS, intervalMs);
      const steps = this.steps();
      const start = steps.length === 0 ? 0 : this.rotation % steps.length;
      this.rotation += 1;
      const results: PurgeResult[] = [];
      for (let i = 0; i < steps.length; i += 1) {
        if (this.stopping || (i > 0 && Date.now() >= deadlineAt)) break;
        const step = steps[(start + i) % steps.length] as PurgeStep;
        const result = await purgeInBatches(this.dataSource, step, {
          ...options,
          deadlineAt,
          shouldStop: () => this.stopping,
        });
        recordRetention(this.meter, result);
        if (result.rows > 0) {
          this.logger.log(
            `retention ${result.label} (${result.mode}): ${result.rows} hàng / ${result.batches} lô${
              result.capped ? ', còn backlog' : ''
            }`,
          );
        }
        results.push(result);
      }
      return results;
    }, []);
  }
}
