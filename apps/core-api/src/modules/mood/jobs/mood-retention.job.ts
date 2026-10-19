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
 * `MOOD_EVENT_RETENTION_DAYS` ngày không còn nghĩa — trừ khi còn bảo vệ trạng thái đang hiệu lực (xem `predicate`: không xoá `set`
 * còn hạn, không xoá sự kiện đang che một `set` còn hạn cũ hơn); hạn giữ thực tế không bao giờ ngắn hơn TTL trạng thái (làm tròn lên ngày) + 1 ngày,
 * nên nâng `MOOD_STATUS_TTL_HOURS` không làm job xoá sự kiện của trạng thái còn sống. Đánh đổi: `idempotency_key` UNIQUE chỉ bảo vệ trong khoảng đó (client retry
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
    const configuredDays = this.config.getOrThrow('MOOD_EVENT_RETENTION_DAYS', {
      infer: true,
    });
    if (configuredDays <= 0) return [];
    // Không bao giờ xoá sự kiện của trạng thái còn sống: hạn giữ tối thiểu = TTL trạng thái (làm tròn lên ngày) + 1 ngày,
    // kể cả khi MOOD_STATUS_TTL_HOURS được nâng lên cao hơn MOOD_EVENT_RETENTION_DAYS × 24.
    const ttlHours = this.config.getOrThrow('MOOD_STATUS_TTL_HOURS', {
      infer: true,
    });
    const days = Math.max(configuredDays, Math.ceil(ttlHours / 24) + 1);
    return [
      {
        label: 'mood_status_events:old',
        table: 'mood_status_events',
        primaryKey: 'id',
        // Hạn giữ theo cấu hình HIỆN TẠI chưa đủ: `expires_at` được snapshot lúc set nên giảm MOOD_STATUS_TTL_HOURS sau đó
        // vẫn để lại các mood cũ còn hiệu lực, và xoá một sự kiện MỚI HƠN (clear / set đã hết hạn) trong khi sự kiện cũ hơn còn
        // hiệu lực sẽ làm mood cũ HIỆN LẠI (mood hiện tại = sự kiện mới nhất, `getCurrentMood`). Vì vậy một dòng chỉ bị xoá khi:
        //  (1) đủ tuổi; (2) không phải một `set` còn hạn; (3) user không còn `set` còn hạn nào CŨ HƠN HOẶC CÙNG created_at với nó (nếu
        //  có, dòng này đang che mood đó; reader chỉ `ORDER BY created_at DESC` không có tie-breaker nên cùng timestamp phải
        //  được coi là có thể che — dùng `<=`, một `set` còn hạn không bao giờ tự chặn chính nó vì đã bị loại ở (2)). Các dòng này tự đủ điều kiện ở lần quét sau khi mood còn hạn kia hết hạn. Subquery dùng
        //  idx_mood_status_events_user_created (user_id, created_at DESC).
        predicate: `created_at < now() - make_interval(days => $2)
          AND NOT (kind = 'set' AND expires_at > now())
          AND NOT EXISTS (
            SELECT 1 FROM mood_status_events live
             WHERE live.user_id = mood_status_events.user_id
               AND live.kind = 'set'
               AND live.expires_at > now()
               AND live.created_at <= mood_status_events.created_at
          )`,
        params: [days],
        orderBy: 'created_at',
      },
    ];
  }
}
