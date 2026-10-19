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
import { VideoCounterBufferPort } from '../ports/video-counter-buffer.port';

import type { CoreApiEnv } from '../../../config/env.validation';

const VIDEO_COUNTER_FLUSH_JOB = 'short-video-counter-flush';
/** Trần số lượt drain mỗi tick — chặn một tick gánh cả backlog (phần còn lại để tick sau). */
const MAX_DRAINS_PER_TICK = 20;

/**
 * Ghi delta counter đã đệm vào `videos` (ADR 0013): mỗi tick drain tối đa `VIDEO_COUNTER_FLUSH_BATCH` video và áp
 * bằng MỘT câu UPDATE (`unnest`) — một video viral nhận hàng nghìn lượt like/giây vẫn chỉ tốn một lần ghi mỗi tick
 * thay vì một lần ghi + khoá hàng cho từng lượt. Cluster singleton. Flush DB lỗi thì cộng lại delta vào bộ đệm
 * (tick sau thử lại). `GREATEST(…, 0)` giữ counter không âm khi unlike/xoá comment đến trước lượt cộng tương ứng.
 * Chỉ chạy khi `VIDEO_COUNTER_BUFFER_ENABLED=true`.
 */
@Injectable()
export class VideoCounterFlushService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(VideoCounterFlushService.name);
  private readonly job = new ManagedInterval();
  private stopping = false;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService<CoreApiEnv, true>,
    private readonly scheduler: SchedulerRegistry,
    private readonly buffer: VideoCounterBufferPort,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.buffer.enabled) return;
    this.job.start(this.scheduler, {
      jobName: VIDEO_COUNTER_FLUSH_JOB,
      intervalMs: this.config.getOrThrow('VIDEO_COUNTER_FLUSH_INTERVAL_MS', {
        infer: true,
      }),
      task: () => this.runOnce(),
      logger: this.logger,
      errorMessage: 'Video counter flush lỗi',
      clusterSingleton: { dataSource: this.dataSource },
    });
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopping = true;
    this.job.stop();
    // Xả nốt phần còn đệm để không mất delta khi pod tắt êm (best-effort).
    if (this.buffer.enabled) {
      await this.runOnce().catch(() => undefined);
    }
  }

  /** 1 tick — trả số video đã cập nhật. Public để test/chạy tay. */
  async runOnce(): Promise<number> {
    return this.job.runExclusive(async () => {
      if (!this.buffer.enabled) return 0;
      const batch = this.config.getOrThrow('VIDEO_COUNTER_FLUSH_BATCH', {
        infer: true,
      });
      let flushed = 0;
      for (let i = 0; i < MAX_DRAINS_PER_TICK; i += 1) {
        const items = await this.buffer.drain(batch);
        if (items.length === 0) break;
        try {
          await this.dataSource.query(
            `UPDATE videos v
                SET view_count = GREATEST(v.view_count + d.views, 0),
                    like_count = GREATEST(v.like_count + d.likes, 0),
                    comment_count = GREATEST(v.comment_count + d.comments, 0)
               FROM (
                 SELECT unnest($1::uuid[]) AS id,
                        unnest($2::int[]) AS views,
                        unnest($3::int[]) AS likes,
                        unnest($4::int[]) AS comments
               ) d
              WHERE v.id = d.id`,
            [
              items.map((item) => item.videoId),
              items.map((item) => item.views),
              items.map((item) => item.likes),
              items.map((item) => item.comments),
            ],
          );
        } catch (error) {
          // Không để mất delta: cộng lại vào bộ đệm rồi để lỗi nổi lên cho ManagedInterval log.
          await this.buffer.restore(items).catch((restoreError: unknown) => {
            this.logger.error(
              { err: `${restoreError}` },
              'Không cộng lại được delta counter sau khi flush lỗi — số đếm có thể lệch nhẹ',
            );
          });
          throw error;
        }
        flushed += items.length;
        if (items.length < batch || this.stopping) break;
      }
      return flushed;
    }, 0);
  }
}
