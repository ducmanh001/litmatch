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
 * Retention cho `mood_status_events` (ADR 0014): trạng thái tâm trạng chỉ sống `MOOD_STATUS_TTL_HOURS` giờ nên sự kiện cũ hơn
 * `MOOD_EVENT_RETENTION_DAYS` ngày không còn nghĩa. Đánh đổi: `idempotency_key` UNIQUE chỉ bảo vệ trong khoảng đó (client retry
 * sau hàng ngày không còn là retry).
 */
@Injectable()
export class MoodRetentionJob extends RetentionJob {
  protected readonly jobName = 'mood-retention';
  protected readonly logger = new Logger(MoodRetentionJob.name);

  constructor(
    @InjectDataSource() dataSource: DataSource,
    config: ConfigService<CoreApiEnv, true>,
    scheduler: SchedulerRegistry,
    @Inject(METRICS_METER) meter: Meter,
  ) {
    super(dataSource, config, scheduler, meter);
  }

  protected steps(): PurgeStep[] {
    const days = this.config.getOrThrow('MOOD_EVENT_RETENTION_DAYS', {
      infer: true,
    });
    if (days <= 0) return [];
    return [
      {
        label: 'mood_status_events:old',
        table: 'mood_status_events',
        primaryKey: 'id',
        predicate: 'created_at < now() - make_interval(days => $2)',
        params: [days],
      },
    ];
  }
}
