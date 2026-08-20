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
export { WebPushSubscription } from './entities/web-push-subscription.entity';
export { WebPushSubscriptionService } from './services/web-push-subscription.service';
export {
  PushNotificationPort,
  type PushDeliveryResult,
  type PushNotificationMessage,
} from '../../common/platform';
