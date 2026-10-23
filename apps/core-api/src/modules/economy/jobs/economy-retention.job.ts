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
 * Retention CHỈ cho `outbox_events` (ADR 0014) — KHÔNG đụng sổ cái (`transactions`, `ledger_entries` là append-only,
 * không bao giờ xoá). Outbox là hàng đợi trung chuyển: mỗi giao dịch sổ cái sinh một sự kiện, và sự kiện đã publish (hoặc
 * đã chuyển dead-letter) không còn giá trị vận hành sau vài ngày.
 *
 * Lưu ý vận hành: khi relay tắt (mặc định ở K8s — chưa có consumer) KHÔNG sự kiện nào được publish nên quy tắc này không xoá gì và
 * bảng tăng vô hạn. Phải quyết định: bật relay (có consumer), hoặc ngừng ghi outbox khi không có consumer — xem ADR 0014.
 * Hai index một phần `published_at IS NOT NULL` / `dead_lettered_at IS NOT NULL` nên hàng chưa publish không tốn gì ở index.
 */
@Injectable()
export class EconomyRetentionJob extends RetentionJob {
  protected readonly jobName = 'economy-retention';
  protected readonly logger = new Logger(EconomyRetentionJob.name);

  constructor(
    @InjectDataSource() dataSource: DataSource,
    config: ConfigService<CoreApiEnv, true>,
    scheduler: SchedulerRegistry,
    @Inject(METRICS_METER) meter: Meter,
  ) {
    super(dataSource, config, scheduler, meter);
  }

  protected steps(): PurgeStep[] {
    const publishedDays = this.config.getOrThrow(
      'OUTBOX_PUBLISHED_RETENTION_DAYS',
      { infer: true },
    );
    const deadDays = this.config.getOrThrow(
      'OUTBOX_DEAD_LETTER_RETENTION_DAYS',
      {
        infer: true,
      },
    );
    const steps: PurgeStep[] = [];
    if (publishedDays > 0) {
      steps.push({
        label: 'outbox_events:published',
        table: 'outbox_events',
        primaryKey: 'id',
        predicate:
          'published_at IS NOT NULL AND published_at < now() - make_interval(days => $2)',
        params: [publishedDays],
        orderBy: 'published_at',
      });
    }
    if (deadDays > 0) {
      steps.push({
        label: 'outbox_events:dead_letter',
        table: 'outbox_events',
        primaryKey: 'id',
        predicate:
          'dead_lettered_at IS NOT NULL AND dead_lettered_at < now() - make_interval(days => $2)',
        params: [deadDays],
        orderBy: 'dead_lettered_at',
      });
    }
    return steps;
  }
}
