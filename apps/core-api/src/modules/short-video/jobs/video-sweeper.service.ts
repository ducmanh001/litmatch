import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { VideoStatus } from '../entities/video.entity';

import type { CoreApiEnv } from '../../../config/env.validation';

const VIDEO_SWEEPER_JOB = 'short-video-sweeper';

/**
 * Dọn video kẹt ở `uploading` quá lâu (client bỏ dở/crash giữa chừng — docs/services/
 * short-video-service.md § 1) → `failed`. Conditional UPDATE, không lock — cùng pattern
 * `ticket-sweeper.service.ts`.
 */
@Injectable()
export class VideoSweeperService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(VideoSweeperService.name);
  private running = false;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService<CoreApiEnv, true>,
    private readonly scheduler: SchedulerRegistry,
  ) {}

  onApplicationBootstrap(): void {
    const interval = setInterval(
      () =>
        void this.runOnce().catch((err) =>
          this.logger.error({ err: `${err}` }, 'Video sweeper lỗi'),
        ),
      this.config.getOrThrow('VIDEO_SWEEPER_INTERVAL_MS', { infer: true }),
    );
    this.scheduler.addInterval(VIDEO_SWEEPER_JOB, interval);
  }

  onApplicationShutdown(): void {
    if (this.scheduler.doesExist('interval', VIDEO_SWEEPER_JOB)) {
      this.scheduler.deleteInterval(VIDEO_SWEEPER_JOB);
    }
  }

  /** 1 tick — public để test/chạy tay. */
  async runOnce(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const timeoutSeconds = this.config.getOrThrow(
        'VIDEO_UPLOAD_TIMEOUT_SECONDS',
        { infer: true },
      );
      const [, count] = (await this.dataSource.query(
        `UPDATE videos
            SET status = $1, updated_at = now()
          WHERE status = $2 AND created_at < now() - make_interval(secs => $3)`,
        [VideoStatus.Failed, VideoStatus.Uploading, timeoutSeconds],
      )) as [unknown, number];
      return count;
    } finally {
      this.running = false;
    }
  }
}
