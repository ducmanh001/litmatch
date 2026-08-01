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
/** Giữ transaction delete ngắn; backlog được xử lý dần ở các tick sau. */
const STORY_SWEEP_BATCH = 500;

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
    this.job.stop();
  }

  /** 1 tick — public để test/chạy tay. */
  async runOnce(): Promise<void> {
    await this.job.runExclusive(async () => {
      await this.dataSource.query(
        `DELETE FROM stories
          WHERE id IN (
            SELECT id
              FROM stories
             WHERE expires_at <= now()
             ORDER BY expires_at ASC, id ASC
             LIMIT $1
          )`,
        [STORY_SWEEP_BATCH],
      );
    }, undefined);
  }
}
