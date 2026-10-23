import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';

import { ManagedInterval } from '../../../common/scheduling/managed-interval';

import type { CoreApiEnv } from '../../../config/env.validation';
import type { DataSource } from 'typeorm';

const STORY_SWEEPER_JOB = 'story-sweeper';
/** Giữ mỗi câu delete ngắn (mỗi story kéo theo hàng trăm `story_views` xoá cascade). */
const STORY_SWEEP_BATCH = 500;
/**
 * Trần thời gian một tick: lặp lô tới khi hết story hết hạn hoặc chạm trần (phần còn lại để tick sau). Trước đây mỗi tick chỉ
 * xoá ĐÚNG 1 lô 500 nên thông lượng cứng là 500 story/giờ — tạo story nhanh hơn mức đó thì backlog (và `story_views` cascade)
 * tăng vô hạn (ADR 0014). Thông lượng tối đa ≈ (ngân sách ÷ thời gian một lô) × 500 story mỗi tick; ở quy mô lớn phải hạ
 * `STORY_SWEEPER_INTERVAL_MS` (mặc định 1 giờ) để đủ tick: lô và ngân sách là hằng số trong mã, KHÔNG chịu `RETENTION_*`.
 */
const STORY_SWEEP_TICK_BUDGET_MS = 30_000;
/** Nghỉ giữa các lô để vacuum/replica theo kịp (cùng tinh thần `RETENTION_BATCH_PAUSE_MS`). */
const STORY_SWEEP_PAUSE_MS = 50;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Dọn rác story hết hạn (docs/services/feed-service.md § 8) — KHÔNG phải chốt correctness
 * (read-path đã tự filter `expiresAt <= now()`, xem `StoryService.getStoryOrThrow`/`getRing`).
 * Hard-delete (không soft-delete như `Post`) — story ephemeral, không cần audit trail.
 * `story_views` tự cascade xoá theo FK (`ON DELETE CASCADE`).
 */
@Injectable()
export class StorySweeperService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(StorySweeperService.name);
  private readonly job = new ManagedInterval();
  private stopping = false;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService<CoreApiEnv, true>,
    private readonly scheduler: SchedulerRegistry,
  ) {}

  onApplicationBootstrap(): void {
    this.job.start(this.scheduler, {
      jobName: STORY_SWEEPER_JOB,
      intervalMs: this.config.getOrThrow('STORY_SWEEPER_INTERVAL_MS', {
        infer: true,
      }),
      task: () => this.runOnce(),
      logger: this.logger,
      errorMessage: 'Story sweeper lỗi',
      skipWhenIdle: true,
      clusterSingleton: { dataSource: this.dataSource },
    });
  }

  onApplicationShutdown(): void {
    // Lô đang chạy xong rồi dừng; không bắt đầu lô mới (SIGTERM không phải chờ hết ngân sách 30 giây).
    this.stopping = true;
    this.job.stop();
  }

  /** 1 tick — trả số story đã xoá. Public để test/chạy tay. */
  async runOnce(): Promise<number> {
    return this.job.runExclusive(async () => {
      const deadline = Date.now() + STORY_SWEEP_TICK_BUDGET_MS;
      let total = 0;
      let capped: boolean;
      for (;;) {
        const [row] = (await this.dataSource.query(
          `WITH removed AS (
             DELETE FROM stories
              WHERE id IN (
                SELECT id
                  FROM stories
                 WHERE expires_at <= now()
                 ORDER BY expires_at ASC, id ASC
                 LIMIT $1
              )
             RETURNING 1
           )
           SELECT count(*)::int AS n FROM removed`,
          [STORY_SWEEP_BATCH],
        )) as Array<{ n: number }>;
        const removed = row?.n ?? 0;
        total += removed;
        capped = removed >= STORY_SWEEP_BATCH;
        if (!capped || this.stopping || Date.now() >= deadline) break;
        await sleep(STORY_SWEEP_PAUSE_MS);
      }
      if (total > 0) {
        this.logger.log(
          `story sweeper: đã xoá ${total} story hết hạn${capped ? ', còn backlog (tick sau tiếp tục)' : ''}`,
        );
      }
      return total;
    }, 0);
  }
}
