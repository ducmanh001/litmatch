import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';
import { Notification } from './entities/notification.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Notification])],
  controllers: [NotificationController],
  providers: [NotificationService],
  // Matching/Friend/Gift/Feed gọi NotificationService qua DI (docs/services/notification-service.md § 1)
  exports: [NotificationService],
})
export class NotificationModule {}
