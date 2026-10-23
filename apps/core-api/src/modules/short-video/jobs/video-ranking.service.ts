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

import type { CoreApiEnv } from '../../../config/env.validation';

/** Sàn khoảng tính lại: bảo đảm hạn mới luôn nằm trong tương lai nên một video không bị tính hai lần trong một tick. */
const MIN_REFRESH_SECONDS = 60;
const VIDEO_RANKING_JOB = 'short-video-ranking';

/**
 * Ranking v1 (docs/services/short-video-service.md § 4): `rankScore` = engagement có trọng số,
 * chia cho hệ số time-decay tuyến tính theo giờ kể từ `createdAt`. Job derive, KHÔNG phải nguồn
 * sự thật — fallback `sort=recent` khi `rankScore IS NULL` (video mới toanh, job chưa kịp chạy).
 *
 * Mỗi tick tính lại các video published ĐẾN HẠN (`rank_due_at` NULL hoặc ≤ now, theo thứ tự hạn). Sau khi tính, hạn kế tiếp
 * = now + `VIDEO_RANKING_STALENESS_PCT %` × (`VIDEO_RANK_TIME_DECAY_HOURS` + tuổi video), kẹp trong [60 giây,
 * `VIDEO_RANKING_MAX_INTERVAL_HOURS`]: điểm = tương tác / (1 + tuổi/decay) chỉ lệch tương đối ≈ Δ/(decay + tuổi) sau Δ giờ
 * nên video mới được tính lại mỗi ~30 phút còn video nhiều tháng tuổi mỗi vài ngày — công việc tỉ lệ với video TRẺ và HOẠT
 * ĐỘNG (counter đổi kéo hạn về ≤ `VIDEO_RANKING_ACTIVE_REFRESH_SECONDS`), KHÔNG với cả catalogue (trước đây chu kỳ đầy đủ =
 * số video / lô × chu kỳ tick, hàng chục triệu video không bao giờ kịp). Công thức điểm không đổi. Hạn luôn nằm trong
 * tương lai sau khi tính nên mỗi video tối đa một lần mỗi tick. `SKIP LOCKED` để không chờ video đang bị moderation
 * chuyển trạng thái.
 */
@Injectable()
export class VideoRankingService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(VideoRankingService.name);
  private readonly job = new ManagedInterval();

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService<CoreApiEnv, true>,
    private readonly scheduler: SchedulerRegistry,
  ) {}

  onApplicationBootstrap(): void {
    this.job.start(this.scheduler, {
      jobName: VIDEO_RANKING_JOB,
      intervalMs: this.config.getOrThrow('VIDEO_RANKING_JOB_INTERVAL_MS', {
        infer: true,
      }),
      task: () => this.runOnce(),
      logger: this.logger,
      errorMessage: 'Video ranking job lỗi',
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

      const batchSize = this.config.getOrThrow('VIDEO_RANKING_BATCH_SIZE', {
        infer: true,
      });
      const maxBatches = this.config.getOrThrow(
        'VIDEO_RANKING_MAX_BATCHES_PER_TICK',
        { infer: true },
      );

      const stalenessFraction =
        this.config.getOrThrow('VIDEO_RANKING_STALENESS_PCT', { infer: true }) /
        100;
      const maxIntervalSeconds =
        this.config.getOrThrow('VIDEO_RANKING_MAX_INTERVAL_HOURS', {
          infer: true,
        }) * 3600;

      let total = 0;
      for (let batch = 0; batch < maxBatches; batch += 1) {
        const [, count] = (await this.dataSource.query(
          `UPDATE videos
          SET rank_score = (view_count * $1 + like_count * $2 + comment_count * $3)
                              / (1 + EXTRACT(EPOCH FROM (now() - created_at)) / 3600.0 / $4),
              rank_computed_at = now(),
              rank_due_at = now() + make_interval(secs => LEAST($7::float8, GREATEST($8::float8,
                $9::float8 * ($10::float8 + EXTRACT(EPOCH FROM (now() - created_at)) / 3600.0) * 3600.0)))
          WHERE id IN (
            SELECT id FROM videos
             WHERE status = $5
               AND (rank_due_at IS NULL OR rank_due_at <= now())
             ORDER BY rank_due_at ASC NULLS FIRST, id ASC
             LIMIT $6
             FOR UPDATE SKIP LOCKED
          )`,
          [
            weightView,
            weightLike,
            weightComment,
            decayHours,
            VideoStatus.Published,
            batchSize,
            maxIntervalSeconds,
            MIN_REFRESH_SECONDS,
            stalenessFraction,
            decayHours,
          ],
        )) as [unknown, number];
        total += count;
        if (count < batchSize) break;
      }
      return total;
    }, 0);
  }
}
