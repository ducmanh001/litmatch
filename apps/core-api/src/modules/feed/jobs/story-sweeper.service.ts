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
  private running = false;

  constructor(
    @InjectRepository(Story) private readonly storyRepo: Repository<Story>,
    private readonly config: ConfigService<CoreApiEnv, true>,
    private readonly scheduler: SchedulerRegistry,
  ) {}

  onApplicationBootstrap(): void {
    const interval = setInterval(
      () =>
        void this.runOnce().catch((err) =>
          this.logger.error({ err: `${err}` }, 'Story sweeper lỗi'),
        ),
      this.config.getOrThrow('STORY_SWEEPER_INTERVAL_MS', { infer: true }),
    );
    this.scheduler.addInterval(STORY_SWEEPER_JOB, interval);
  }

  onApplicationShutdown(): void {
    if (this.scheduler.doesExist('interval', STORY_SWEEPER_JOB)) {
      this.scheduler.deleteInterval(STORY_SWEEPER_JOB);
    }
  }

  /** 1 tick — public để test/chạy tay. */
  async runOnce(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.storyRepo.delete({ expiresAt: LessThanOrEqual(new Date()) });
    } finally {
      this.running = false;
    }
  }
}
