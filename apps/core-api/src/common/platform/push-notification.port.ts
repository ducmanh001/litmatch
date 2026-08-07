export type PushDeliveryStatus = 'delivered' | 'skipped' | 'failed';

export interface PushNotificationMessage {
  notificationId: string;
  recipientId: string;
  type: string;
  /** Device token is supplied by a future device-registration flow; never log it. */
  deviceToken?: string;
}

export interface PushDeliveryResult {
  status: PushDeliveryStatus;
}

/**
 * Business code only knows this contract. Provider SDKs and HTTP details stay in adapters.
 */
export abstract class PushNotificationPort {
  abstract send(message: PushNotificationMessage): Promise<PushDeliveryResult>;
}
