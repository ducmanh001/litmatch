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
 * Retention cho `notifications` (ADR 0013, docs/services/notification-service.md): bảng này tăng theo
 * từng sự kiện (like, comment, tin nhắn, quà...) và không có FK nào trỏ vào nó nên xoá theo tuổi là an toàn.
 * Hai quy tắc vì đọc hội thoại không đánh dấu notification đã đọc — notification chưa đọc cần hạn riêng:
 * - đã đọc quá `NOTIFICATION_READ_RETENTION_DAYS` kể từ lúc đọc;
 * - chưa đọc quá `NOTIFICATION_UNREAD_RETENTION_DAYS` kể từ lúc tạo.
 * Index một phần cho từng quy tắc: `idx_notifications_read_at`, `idx_notifications_unread_created`.
 */
@Injectable()
export class NotificationRetentionJob extends RetentionJob {
  protected readonly jobName = 'notification-retention';
  protected readonly logger = new Logger(NotificationRetentionJob.name);

  constructor(
    @InjectDataSource() dataSource: DataSource,
    config: ConfigService<CoreApiEnv, true>,
    scheduler: SchedulerRegistry,
    @Inject(METRICS_METER) meter: Meter,
  ) {
    super(dataSource, config, scheduler, meter);
  }

  protected steps(): PurgeStep[] {
    const readDays = this.config.getOrThrow(
      'NOTIFICATION_READ_RETENTION_DAYS',
      {
        infer: true,
      },
    );
    const unreadDays = this.config.getOrThrow(
      'NOTIFICATION_UNREAD_RETENTION_DAYS',
      { infer: true },
    );
    const steps: PurgeStep[] = [];
    if (readDays > 0) {
      steps.push({
        label: 'notifications:read',
        table: 'notifications',
        primaryKey: 'id',
        predicate:
          'read_at IS NOT NULL AND read_at < now() - make_interval(days => $2)',
        params: [readDays],
        orderBy: 'read_at',
      });
    }
    if (unreadDays > 0) {
      steps.push({
        label: 'notifications:unread',
        table: 'notifications',
        primaryKey: 'id',
        predicate:
          'read_at IS NULL AND created_at < now() - make_interval(days => $2)',
        params: [unreadDays],
        orderBy: 'created_at',
      });
    }
    return steps;
  }
}
