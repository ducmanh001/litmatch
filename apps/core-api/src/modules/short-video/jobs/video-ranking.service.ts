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

const VIDEO_RANKING_JOB = 'short-video-ranking';

/**
 * Ranking v1 (docs/services/short-video-service.md § 4): `rankScore` = engagement có trọng số,
 * chia cho hệ số time-decay tuyến tính theo giờ kể từ `createdAt`. Job derive, KHÔNG phải nguồn
 * sự thật — fallback `sort=recent` khi `rankScore IS NULL` (video mới toanh, job chưa kịp chạy).
 * V1 tính lại toàn bộ published video mỗi tick (đơn giản, đủ cho quy mô nhỏ) — nâng cấp thành
 * incremental/watch-time-weighted sau không đổi schema (`rankScore` vẫn 1 cột double precision).
 */
@Injectable()
export class VideoRankingService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(VideoRankingService.name);
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
          this.logger.error({ err: `${err}` }, 'Video ranking job lỗi'),
        ),
      this.config.getOrThrow('VIDEO_RANKING_JOB_INTERVAL_MS', { infer: true }),
    );
    this.scheduler.addInterval(VIDEO_RANKING_JOB, interval);
  }

  onApplicationShutdown(): void {
    if (this.scheduler.doesExist('interval', VIDEO_RANKING_JOB)) {
      this.scheduler.deleteInterval(VIDEO_RANKING_JOB);
    }
  }

  /** 1 tick — public để test/chạy tay. */
  async runOnce(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const weightView = this.config.getOrThrow('VIDEO_RANK_WEIGHT_VIEW', {
        infer: true,
      });
      const weightLike = this.config.getOrThrow('VIDEO_RANK_WEIGHT_LIKE', {
        infer: true,
      });
      const weightComment = this.config.getOrThrow(
        'VIDEO_RANK_WEIGHT_COMMENT',
        { infer: true },
      );
      const decayHours = this.config.getOrThrow('VIDEO_RANK_TIME_DECAY_HOURS', {
        infer: true,
      });

      const [, count] = (await this.dataSource.query(
        `UPDATE videos
            SET rank_score = (view_count * $1 + like_count * $2 + comment_count * $3)
                              / (1 + EXTRACT(EPOCH FROM (now() - created_at)) / 3600.0 / $4),
                updated_at = now()
          WHERE status = $5`,
        [
          weightView,
          weightLike,
          weightComment,
          decayHours,
          VideoStatus.Published,
        ],
      )) as [unknown, number];
      return count;
    } finally {
      this.running = false;
    }
  }
}
