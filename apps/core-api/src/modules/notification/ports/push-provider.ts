import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { CoreApiEnv } from '../../../config/env.validation';
import type { Notification } from '../entities/notification.entity';

/**
 * Gửi push thật (FCM/APNs) — chọn implementation qua env `NOTIFICATION_PUSH_PROVIDER`
 * (docs/services/notification-service.md § 4). Best-effort: lỗi push KHÔNG được throw ra caller,
 * chỉ log — push chỉ là side effect phụ, không phải nguồn sự thật (in-app Notification mới là).
 */
export abstract class PushPort {
  abstract send(notification: Notification): Promise<void>;
}

/**
 * Dev/test: log, không gửi gì thật — chặn cứng ở production, giống `DevIapVerifier`
 * (economy-service.md). CHƯA có implementation FCM/APNs thật ở GĐ4 (chưa có credential, xem
 * notification-service.md § 4) — khi có, thêm `StoreFcmPushProvider`/`StoreApnsPushProvider`
 * cùng file này, bind qua `NOTIFICATION_PUSH_PROVIDER=fcm`.
 */
@Injectable()
export class DevPushProvider
  extends PushPort
  implements OnApplicationBootstrap
{
  private readonly logger = new Logger(DevPushProvider.name);

  constructor(private readonly config: ConfigService<CoreApiEnv, true>) {
    super();
  }

  onApplicationBootstrap(): void {
    if (this.config.get('NODE_ENV', { infer: true }) === 'production') {
      throw new Error(
        'DevPushProvider không được dùng ở production — set NOTIFICATION_PUSH_PROVIDER=fcm',
      );
    }
  }

  async send(notification: Notification): Promise<void> {
    this.logger.debug(
      `[dev-push] userId=${notification.userId} type=${notification.type} (no-op)`,
    );
  }
}
