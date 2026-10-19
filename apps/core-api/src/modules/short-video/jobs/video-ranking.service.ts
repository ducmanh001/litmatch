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

const VIDEO_RANKING_JOB = 'short-video-ranking';

/**
 * Ranking v1 (docs/services/short-video-service.md § 4): `rankScore` = engagement có trọng số,
 * chia cho hệ số time-decay tuyến tính theo giờ kể từ `createdAt`. Job derive, KHÔNG phải nguồn
 * sự thật — fallback `sort=recent` khi `rankScore IS NULL` (video mới toanh, job chưa kịp chạy).
 *
 * Mỗi tick tính lại một lô video published, xoay vòng theo `rank_computed_at` (NULL trước = video mới được
 * ưu tiên, rồi tới video tính điểm lâu nhất). Trước đây xoay theo `updated_at` mà `increment` counter tự cập nhật
 * `updated_at` nên video đang nóng bị xếp CUỐI hàng chờ. Công thức không đổi; chu kỳ đầy đủ = số video / lô × chu kỳ
 * tick nên tăng `VIDEO_RANKING_BATCH_SIZE`/`VIDEO_RANKING_MAX_BATCHES_PER_TICK` theo quy mô (hàng chục triệu video
 * cần khoá xếp hạng không phụ thuộc tuổi hoặc ZSET — ADR riêng). `SKIP LOCKED` để không chờ video đang bị
 * moderation chuyển trạng thái.
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

      // Mốc bắt đầu tick theo đồng hồ DB (giữ micro giây): lô sau chỉ lấy video chưa được tính TRONG tick này.
      // Thiếu điều kiện đó thì catalogue nhỏ hơn lô × số lô bị ghi lại nhiều lần mỗi tick (mỗi lần UPDATE là
      // non-HOT vì đổi cả `rank_score` lẫn `rank_computed_at`, kéo theo ghi hai index) và vòng lặp không bao giờ dừng sớm.
      const [{ tickStart }] = (await this.dataSource.query(
        `SELECT clock_timestamp()::text AS "tickStart"`,
      )) as Array<{ tickStart: string }>;

      let total = 0;
      for (let batch = 0; batch < maxBatches; batch += 1) {
        const [, count] = (await this.dataSource.query(
          `UPDATE videos
          SET rank_score = (view_count * $1 + like_count * $2 + comment_count * $3)
                              / (1 + EXTRACT(EPOCH FROM (now() - created_at)) / 3600.0 / $4),
                rank_computed_at = now()
          WHERE id IN (
            SELECT id FROM videos
             WHERE status = $5
               AND (rank_computed_at IS NULL OR rank_computed_at < $7::timestamptz)
             ORDER BY rank_computed_at ASC NULLS FIRST, id ASC
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
            tickStart,
          ],
        )) as [unknown, number];
        total += count;
        if (count < batchSize) break;
      }
      return total;
    }, 0);
  }
}
