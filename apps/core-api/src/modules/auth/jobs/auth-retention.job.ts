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
 *   tăng nhanh nhất trong mô hình dữ liệu (`pnpm capacity:data`). Quy tắc ở đây dọn hàng đã HẾT HẠN quá
 *   `AUTH_REFRESH_RETENTION_GRACE_DAYS` ngày, theo `expires_at` (cột không bao giờ bị UPDATE) nên đổi `AUTH_REFRESH_TTL_DAYS`
 *   không làm xoá nhầm token còn hạn; mọi hàng đủ điều kiện đều xoá được (không có hàng "sống sót" xen kẽ). Quy tắc KHÔNG đổi
 *   tính chất bảo mật (token đã hết hạn thì vốn đã bị từ chối). Việc dọn token ĐÃ XOAY sớm hơn (quyết định bảo mật) nằm ở
 *   `TypeOrmRefreshSessionAdapter.rotate` và mặc định TẮT (`AUTH_REFRESH_ROTATED_RETENTION_DAYS`).
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
    const otpDays = this.config.getOrThrow('AUTH_OTP_RETENTION_DAYS', {
      infer: true,
    });
    const steps: PurgeStep[] = [];
    if (graceDays > 0) {
      steps.push({
        label: 'refresh_tokens:expired',
        table: 'refresh_tokens',
        primaryKey: 'id',
        predicate: 'expires_at < now() - make_interval(days => $2)',
        params: [graceDays],
        orderBy: 'expires_at',
      });
    }
    if (otpDays > 0) {
      steps.push({
        label: 'phone_otps:old',
        table: 'phone_otps',
        primaryKey: 'id',
        predicate: 'created_at < now() - make_interval(days => $2)',
        params: [otpDays],
        orderBy: 'created_at',
      });
    }
    return steps;
  }
}
