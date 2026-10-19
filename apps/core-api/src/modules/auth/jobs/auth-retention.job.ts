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
 * Retention cho dữ liệu đăng nhập tăng theo MỖI lần mở app (ADR 0014):
 * - `refresh_tokens`: mỗi lần xoay token (≈ mỗi 15 phút khi đang mở app) sinh một hàng mới và không hàng nào bị xoá — bảng
 *   tăng nhanh nhất trong mô hình dữ liệu (`pnpm capacity:data`). Quy tắc ở đây dọn hàng tạo quá
 *   `AUTH_REFRESH_TTL_DAYS + AUTH_REFRESH_RETENTION_GRACE_DAYS` ngày (chắc chắn đã hết hạn từ lâu; không còn hàng "sống
 *   sót" nào xen kẽ nên chọn lô bằng BRIN `created_at` không phải quét lặp). Token đã xoay được dọn NGAY LÚC xoay, theo
 *   họ (`TypeOrmRefreshSessionAdapter.rotate`), nên bảng chỉ giữ ~GRACE ngày token đã xoay mỗi phiên đang hoạt động.
 * - `phone_otps`: mã đã băm, TTL vài phút; xoá hàng tạo quá `AUTH_OTP_RETENTION_DAYS` ngày.
 */
@Injectable()
export class AuthRetentionJob extends RetentionJob {
  protected readonly jobName = 'auth-retention';
  protected readonly logger = new Logger(AuthRetentionJob.name);

  constructor(
    @InjectDataSource() dataSource: DataSource,
    config: ConfigService<CoreApiEnv, true>,
    scheduler: SchedulerRegistry,
    @Inject(METRICS_METER) meter: Meter,
  ) {
    super(dataSource, config, scheduler, meter);
  }

  protected steps(): PurgeStep[] {
    const graceDays = this.config.getOrThrow(
      'AUTH_REFRESH_RETENTION_GRACE_DAYS',
      { infer: true },
    );
    const ttlDays = this.config.getOrThrow('AUTH_REFRESH_TTL_DAYS', {
      infer: true,
    });
    const otpDays = this.config.getOrThrow('AUTH_OTP_RETENTION_DAYS', {
      infer: true,
    });
    const steps: PurgeStep[] = [];
    if (graceDays > 0) {
      steps.push({
        label: 'refresh_tokens:expired',
        table: 'refresh_tokens',
        primaryKey: 'id',
        predicate: 'created_at < now() - make_interval(days => $2)',
        params: [ttlDays + graceDays],
      });
    }
    if (otpDays > 0) {
      steps.push({
        label: 'phone_otps:old',
        table: 'phone_otps',
        primaryKey: 'id',
        predicate: 'created_at < now() - make_interval(days => $2)',
        params: [otpDays],
      });
    }
    return steps;
  }
}
