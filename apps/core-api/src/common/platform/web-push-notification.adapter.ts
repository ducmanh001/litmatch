import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import webpush from 'web-push';

import { WebPushNotificationPort } from './web-push-notification.port';

import type { CoreApiEnv } from '../../config/env.validation';
import type {
  WebPushDeliveryResult,
  WebPushNotificationMessage,
} from './web-push-notification.port';

@Injectable()
export class WebPushNotificationAdapter
  extends WebPushNotificationPort
  implements OnApplicationBootstrap
{
  constructor(private readonly config: ConfigService<CoreApiEnv, true>) {
    super();
  }

  onApplicationBootstrap(): void {
    if (!this.config.getOrThrow('WEB_PUSH_ENABLED', { infer: true })) return;
    const subject = this.config.getOrThrow('WEB_PUSH_SUBJECT', { infer: true });
    const publicKey = this.config.getOrThrow('WEB_PUSH_PUBLIC_KEY', {
      infer: true,
    });
    const privateKey = this.config.getOrThrow('WEB_PUSH_PRIVATE_KEY', {
      infer: true,
    });
    if (!subject || !publicKey || !privateKey) {
      throw new Error(
        'WEB_PUSH_ENABLED=true requires WEB_PUSH_SUBJECT, WEB_PUSH_PUBLIC_KEY and WEB_PUSH_PRIVATE_KEY',
      );
    }
    webpush.setVapidDetails(subject, publicKey, privateKey);
  }

  async send(
    message: WebPushNotificationMessage,
  ): Promise<WebPushDeliveryResult> {
    if (!this.config.getOrThrow('WEB_PUSH_ENABLED', { infer: true })) {
      return { status: 'skipped' };
    }
    try {
      await webpush.sendNotification(
        message.subscription,
        JSON.stringify({
          notificationId: message.notificationId,
          type: message.type,
          payload: message.payload,
        }),
        { TTL: 3600 },
      );
      return { status: 'delivered' };
    } catch (error) {
      const statusCode =
        typeof error === 'object' && error !== null && 'statusCode' in error
          ? (error as { statusCode?: unknown }).statusCode
          : undefined;
      return {
        status: 'failed',
        removeSubscription: statusCode === 404 || statusCode === 410,
      };
    }
  }
}
