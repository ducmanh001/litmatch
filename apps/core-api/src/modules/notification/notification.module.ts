import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';
import { Notification } from './entities/notification.entity';
import { NotificationRetentionJob } from './jobs/notification-retention.job';
import { WebPushSubscription } from './entities/web-push-subscription.entity';
import { WebPushSubscriptionService } from './services/web-push-subscription.service';

@Module({
  imports: [TypeOrmModule.forFeature([Notification, WebPushSubscription])],
  controllers: [NotificationController],
  providers: [
    NotificationService,
    WebPushSubscriptionService,
    NotificationRetentionJob,
  ],
  // Matching/Friend/Gift/Feed gọi NotificationService qua DI (docs/services/notification-service.md § 1)
  exports: [NotificationService, WebPushSubscriptionService],
})
export class NotificationModule {}
