export interface WebPushSubscriptionMessage {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface WebPushNotificationMessage {
  notificationId: string;
  recipientId: string;
  type: string;
  payload: Record<string, unknown>;
  subscription: WebPushSubscriptionMessage;
}

export interface WebPushDeliveryResult {
  status: 'delivered' | 'skipped' | 'failed';
  /** 404/410 endpoint — xoá subscription để không retry vô hạn. */
  removeSubscription?: boolean;
}

export abstract class WebPushNotificationPort {
  abstract send(
    message: WebPushNotificationMessage,
  ): Promise<WebPushDeliveryResult>;
}
