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

import { ManagedInterval } from '../../../common/scheduling/managed-interval';
import { VideoStatus } from '../entities/video.entity';
import { VideoStoragePort } from '../ports/video-storage.port';

import type { CoreApiEnv } from '../../../config/env.validation';

const VIDEO_SWEEPER_JOB = 'short-video-sweeper';
const VIDEO_SWEEP_BATCH = 200;

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
  private readonly job = new ManagedInterval();

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly storagePort: VideoStoragePort,
    private readonly config: ConfigService<CoreApiEnv, true>,
    private readonly scheduler: SchedulerRegistry,
  ) {}

  onApplicationBootstrap(): void {
    this.job.start(this.scheduler, {
      jobName: VIDEO_SWEEPER_JOB,
      intervalMs: this.config.getOrThrow('VIDEO_SWEEPER_INTERVAL_MS', {
        infer: true,
      }),
      task: () => this.runOnce(),
      logger: this.logger,
      errorMessage: 'Video sweeper lỗi',
      skipWhenIdle: true,
      clusterSingleton: { dataSource: this.dataSource },
    });
  }

  onApplicationShutdown(): void {
    this.job.stop();
  }

  /** 1 tick — public để test/chạy tay. */
  async runOnce(): Promise<number> {
    return this.job.runExclusive(async () => {
      const timeoutSeconds = this.config.getOrThrow(
        'VIDEO_UPLOAD_TIMEOUT_SECONDS',
        { infer: true },
      );
      const expired = (await this.dataSource.query(
        `UPDATE videos
            SET status = $1, updated_at = now()
          WHERE status = $2 AND id IN (
            SELECT id FROM videos
             WHERE status = $2
               AND created_at < now() - make_interval(secs => $3)
             ORDER BY created_at ASC, id ASC
             LIMIT $4
          )
          RETURNING id, storage_key`,
        [
          VideoStatus.Failed,
          VideoStatus.Uploading,
          timeoutSeconds,
          VIDEO_SWEEP_BATCH,
        ],
      )) as Array<{ id: string; storage_key: string }>;
      const failed = (await this.dataSource.query(
        `SELECT id, storage_key
           FROM videos
          WHERE status = $1
          ORDER BY updated_at ASC, id ASC
          LIMIT $2`,
        [VideoStatus.Failed, VIDEO_SWEEP_BATCH],
      )) as Array<{ id: string; storage_key: string }>;

      const cleanupTargets = new Map(
        [...expired, ...failed].map((video) => [video.id, video]),
      );
      for (const video of cleanupTargets.values()) {
        try {
          await this.storagePort.delete(video.storage_key);
        } catch (error) {
          this.logger.warn(
            `Không cleanup được video object ${video.id}; sẽ retry ở tick sau: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
      return expired.length;
    }, 0);
  }
}
