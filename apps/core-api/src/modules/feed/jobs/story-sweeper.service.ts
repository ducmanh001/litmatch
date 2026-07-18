import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';

import { ManagedInterval } from '../../../common/scheduling/managed-interval';
import { Story } from '../entities/story.entity';

import type { CoreApiEnv } from '../../../config/env.validation';

const STORY_SWEEPER_JOB = 'story-sweeper';

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
    @InjectRepository(Story) private readonly storyRepo: Repository<Story>,
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
    });
  }

  onApplicationShutdown(): void {
    this.job.stop();
  }

  /** 1 tick — public để test/chạy tay. */
  async runOnce(): Promise<void> {
    await this.job.runExclusive(async () => {
      await this.storyRepo.delete({ expiresAt: LessThanOrEqual(new Date()) });
    }, undefined);
  }
}
