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
 * Retention cho quota ghép theo ngày UTC (ADR 0014): `match_daily_quotas` (1 hàng / user / ngày / loại) và
 * `guest_match_quotas` (1 hàng / khoá khách / ngày) chỉ có nghĩa trong ngày của chúng — hàng của ngày đã qua không còn
 * ai đọc. Khoá chính ghép (không có cột `id`) nên chọn lô theo `ctid` (an toàn vì hàng đã bị `FOR UPDATE` khoá trong
 * cùng một câu lệnh). Chọn lô theo `quota_date`: `match_daily_quotas` dùng B-tree `idx_match_daily_quotas_quota_date`;
 * `guest_match_quotas` dùng chính khoá chính `(quota_date, key_hash)` (dẫn đầu bằng `quota_date`, không cần index riêng).
 *
 * `match_tickets` / `match_sessions` CHƯA có quy tắc ở đây: vé trỏ tới phiên và ngược lại (FK vòng) và phiên có
 * rating/chat/cuộc gọi phụ thuộc — cần quyết định giữ bằng chứng report và phân vùng theo ngày (xem ADR 0014).
 */
@Injectable()
export class MatchingRetentionJob extends RetentionJob {
  protected readonly jobName = 'matching-retention';
  protected readonly logger = new Logger(MatchingRetentionJob.name);

  constructor(
    @InjectDataSource() dataSource: DataSource,
    config: ConfigService<CoreApiEnv, true>,
    scheduler: SchedulerRegistry,
    @Inject(METRICS_METER) meter: Meter,
  ) {
    super(dataSource, config, scheduler, meter);
  }

  protected steps(): PurgeStep[] {
    const days = this.config.getOrThrow('MATCHING_QUOTA_RETENTION_DAYS', {
      infer: true,
    });
    if (days <= 0) return [];
    return [
      {
        label: 'match_daily_quotas:old',
        table: 'match_daily_quotas',
        primaryKey: 'ctid',
        predicate: 'quota_date < current_date - $2::int',
        params: [days],
        orderBy: 'quota_date',
      },
      {
        label: 'guest_match_quotas:old',
        table: 'guest_match_quotas',
        primaryKey: 'ctid',
        predicate: 'quota_date < current_date - $2::int',
        params: [days],
        orderBy: 'quota_date',
      },
    ];
  }
}
