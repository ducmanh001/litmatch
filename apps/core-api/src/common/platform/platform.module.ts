import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ApnsPushNotificationAdapter } from './apns-push-notification.adapter';
import { AnalyticsPort } from './analytics.port';
import {
  DisabledAnalyticsAdapter,
  PostHogAnalyticsAdapter,
} from './analytics-adapters';
import {
  DevPushNotificationAdapter,
  DisabledPushNotificationAdapter,
} from './dev-platform-adapters';
import { FcmPushNotificationAdapter } from './fcm-push-notification.adapter';
import {
  selectAnalyticsProvider,
  selectPushNotificationProvider,
} from './provider-factory';
import { PushNotificationPort } from './push-notification.port';
import { WebPushNotificationAdapter } from './web-push-notification.adapter';
import { WebPushNotificationPort } from './web-push-notification.port';

import type { CoreApiEnv } from '../../config/env.validation';

@Global()
@Module({
  providers: [
    DevPushNotificationAdapter,
    DisabledPushNotificationAdapter,
    FcmPushNotificationAdapter,
    ApnsPushNotificationAdapter,
    WebPushNotificationAdapter,
    DisabledAnalyticsAdapter,
    PostHogAnalyticsAdapter,
    {
      provide: PushNotificationPort,
      inject: [
        ConfigService,
        DevPushNotificationAdapter,
        FcmPushNotificationAdapter,
        ApnsPushNotificationAdapter,
        DisabledPushNotificationAdapter,
      ],
      useFactory: (
        config: ConfigService<CoreApiEnv, true>,
        dev: DevPushNotificationAdapter,
        fcm: FcmPushNotificationAdapter,
        apns: ApnsPushNotificationAdapter,
        disabled: DisabledPushNotificationAdapter,
      ) =>
        selectPushNotificationProvider(
          config.getOrThrow('NOTIFICATION_PUSH_PROVIDER', { infer: true }),
          { dev, fcm, apns, disabled },
        ),
    },
    {
      provide: AnalyticsPort,
      inject: [
        ConfigService,
        PostHogAnalyticsAdapter,
        DisabledAnalyticsAdapter,
      ],
      useFactory: (
        config: ConfigService<CoreApiEnv, true>,
        posthog: PostHogAnalyticsAdapter,
        disabled: DisabledAnalyticsAdapter,
      ) =>
        selectAnalyticsProvider(
          config.getOrThrow('ANALYTICS_ENABLED', { infer: true }),
          config.getOrThrow('ANALYTICS_PROVIDER', { infer: true }),
          { posthog, disabled },
        ),
    },
    {
      provide: WebPushNotificationPort,
      useExisting: WebPushNotificationAdapter,
    },
  ],
  exports: [PushNotificationPort, AnalyticsPort, WebPushNotificationPort],
})
export class PlatformModule {}
