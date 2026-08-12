import type { AnalyticsPort } from './analytics.port';
import type { PushNotificationPort } from './push-notification.port';

export function selectPushNotificationProvider(
  provider: 'dev' | 'fcm' | 'apns' | 'disabled',
  adapters: {
    dev: PushNotificationPort;
    fcm: PushNotificationPort;
    apns: PushNotificationPort;
    disabled: PushNotificationPort;
  },
): PushNotificationPort {
  return adapters[provider];
}

export function selectAnalyticsProvider(
  enabled: boolean,
  provider: 'posthog' | 'disabled',
  adapters: { posthog: AnalyticsPort; disabled: AnalyticsPort },
): AnalyticsPort {
  return enabled && provider === 'posthog'
    ? adapters.posthog
    : adapters.disabled;
}
