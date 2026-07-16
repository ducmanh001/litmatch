/**
 * Public API của Notification module — module khác CHỈ import từ đây (arch test enforce).
 */
export { NotificationModule } from './notification.module';
export { NotificationService } from './notification.service';
export type {
  CreateNotificationInput,
  BroadcastNotificationInput,
} from './notification.service';
export { Notification, NotificationType } from './entities/notification.entity';
