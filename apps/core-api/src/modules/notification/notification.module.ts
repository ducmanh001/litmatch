import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';
import { Notification } from './entities/notification.entity';
import {
  DisabledPushProvider,
  DevPushProvider,
  PushPort,
} from './ports/push-provider';

import type { CoreApiEnv } from '../../config/env.validation';

@Module({
  imports: [TypeOrmModule.forFeature([Notification])],
  controllers: [NotificationController],
  providers: [
    NotificationService,
    DevPushProvider,
    DisabledPushProvider,
    {
      provide: PushPort,
      inject: [ConfigService, DevPushProvider, DisabledPushProvider],
      useFactory: (
        config: ConfigService<CoreApiEnv, true>,
        dev: DevPushProvider,
        disabled: DisabledPushProvider,
      ) => {
        const provider = config.getOrThrow('NOTIFICATION_PUSH_PROVIDER', {
          infer: true,
        });
        // Chưa có StoreFcmPushProvider thật (docs/services/notification-service.md § 4) —
        // fail-fast thay vì âm thầm dùng dev nếu ai đó set fcm tưởng đã có push thật
        if (provider === 'fcm') {
          throw new Error(
            'NOTIFICATION_PUSH_PROVIDER=fcm nhưng chưa có StoreFcmPushProvider (docs/services/notification-service.md § 4) — local/test dùng dev, production dùng disabled cho tới khi có adapter thật',
          );
        }
        if (provider === 'disabled') return disabled;
        return dev;
      },
    },
  ],
  // Matching/Friend/Gift/Feed gọi NotificationService qua DI (docs/services/notification-service.md § 1)
  exports: [NotificationService],
})
export class NotificationModule {}
