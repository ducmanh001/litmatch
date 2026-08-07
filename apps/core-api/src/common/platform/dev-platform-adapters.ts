import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { CoreApiEnv } from '../../config/env.validation';
import {
  PushNotificationPort,
  type PushDeliveryResult,
  type PushNotificationMessage,
} from './push-notification.port';

@Injectable()
export class DisabledPushNotificationAdapter extends PushNotificationPort {
  async send(message: PushNotificationMessage): Promise<PushDeliveryResult> {
    void message;
    return { status: 'skipped' };
  }
}

@Injectable()
export class DevPushNotificationAdapter
  extends PushNotificationPort
  implements OnApplicationBootstrap
{
  private readonly logger = new Logger(DevPushNotificationAdapter.name);

  constructor(private readonly config: ConfigService<CoreApiEnv, true>) {
    super();
  }

  onApplicationBootstrap(): void {
    if (
      this.config.get('NODE_ENV', { infer: true }) === 'production' &&
      this.config.getOrThrow('NOTIFICATION_PUSH_PROVIDER', { infer: true }) ===
        'dev'
    ) {
      throw new Error(
        'DevPushNotificationAdapter không được dùng ở production — set NOTIFICATION_PUSH_PROVIDER=fcm, apns hoặc disabled',
      );
    }
  }

  async send(message: PushNotificationMessage): Promise<PushDeliveryResult> {
    void message;
    this.logger.debug('[dev-push] delivery skipped');
    return { status: 'skipped' };
  }
}
