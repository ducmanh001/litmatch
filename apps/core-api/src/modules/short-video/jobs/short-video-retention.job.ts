import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { METRICS_METER } from '../../../common/metrics/metrics.constants';
import { RetentionJob } from '../../../common/retention/retention-job';

import type { Meter } from '@opentelemetry/api';
import type { PurgeStep } from '../../../common/retention/batched-purge';
import type { CoreApiEnv } from '../../../config/env.validation';

/**
 * Retention cho tương tác video (ADR 0014):
 * - `video_views`: bảng KHỬ TRÙNG một hàng cho mỗi cặp (video, người xem) — KHÔNG phải mỗi lượt xem — nhưng vẫn tăng theo số cặp
 *   mới mỗi ngày (mô hình: ~144 triệu hàng/ngày ở 10 triệu CCU). Xoá hàng quá `VIDEO_VIEW_RETENTION_DAYS` ngày; đánh đổi: người
 *   xem lại một video SAU hạn đó có thể được đếm thêm một lần vào `viewCount` (counter chỉ là số hiển thị).
 * - `video_comments` đã xoá mềm quá `VIDEO_DELETED_COMMENT_RETENTION_DAYS` ngày: xoá cứng (counter đã trừ lúc xoá mềm).
 * Bình luận còn hiệu lực và lượt thích là TRẠNG THÁI của nội dung, không xoá theo tuổi.
 */
@Injectable()
export class ShortVideoRetentionJob extends RetentionJob {
  protected readonly jobName = 'short-video-retention';
  protected readonly logger = new Logger(ShortVideoRetentionJob.name);

  constructor(
    @InjectDataSource() dataSource: DataSource,
    config: ConfigService<CoreApiEnv, true>,
    scheduler: SchedulerRegistry,
    @Inject(METRICS_METER) meter: Meter,
  ) {
    super(dataSource, config, scheduler, meter);
  }

  protected steps(): PurgeStep[] {
    const viewDays = this.config.getOrThrow('VIDEO_VIEW_RETENTION_DAYS', {
      infer: true,
    });
    const commentDays = this.config.getOrThrow(
      'VIDEO_DELETED_COMMENT_RETENTION_DAYS',
      { infer: true },
    );
    const steps: PurgeStep[] = [];
    if (viewDays > 0) {
      steps.push({
        label: 'video_views:old',
        table: 'video_views',
        primaryKey: 'id',
        predicate: 'created_at < now() - make_interval(days => $2)',
        params: [viewDays],
      });
    }
    if (commentDays > 0) {
      steps.push({
        label: 'video_comments:deleted',
        table: 'video_comments',
        primaryKey: 'id',
        predicate:
          'deleted_at IS NOT NULL AND deleted_at < now() - make_interval(days => $2)',
        params: [commentDays],
        orderBy: 'deleted_at',
      });
    }
    return steps;
  }
}
