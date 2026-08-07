import { ApnsPushNotificationAdapter } from './apns-push-notification.adapter';
import { AnalyticsPort } from './analytics.port';
import {
  DisabledAnalyticsAdapter,
  PostHogAnalyticsAdapter,
} from './analytics-adapters';
import { FcmPushNotificationAdapter } from './fcm-push-notification.adapter';
import {
  selectAnalyticsProvider,
  selectPushNotificationProvider,
} from './provider-factory';
import { PushNotificationPort } from './push-notification.port';

import type { ConfigService } from '@nestjs/config';
import type { CoreApiEnv } from '../../config/env.validation';
import type { ApnsPushTransport } from './apns-push-notification.adapter';
import type { FcmPushTransport } from './fcm-push-notification.adapter';

const MESSAGE = {
  notificationId: 'notification-1',
  recipientId: 'user-1',
  type: 'friend_message',
  deviceToken: 'provider-token',
};

function config(values: Partial<CoreApiEnv>): ConfigService<CoreApiEnv, true> {
  return {
    get: jest.fn((key: keyof CoreApiEnv) => values[key]),
    getOrThrow: jest.fn((key: keyof CoreApiEnv) => values[key]),
  } as unknown as ConfigService<CoreApiEnv, true>;
}

describe('platform provider selection', () => {
  it('disabled feature/provider selects no-op adapters', () => {
    const pushDisabled = {} as PushNotificationPort;
    const analyticsDisabled = {} as AnalyticsPort;

    expect(
      selectPushNotificationProvider('disabled', {
        dev: {} as PushNotificationPort,
        fcm: {} as PushNotificationPort,
        apns: {} as PushNotificationPort,
        disabled: pushDisabled,
      }),
    ).toBe(pushDisabled);
    expect(
      selectAnalyticsProvider(false, 'posthog', {
        posthog: {} as AnalyticsPort,
        disabled: analyticsDisabled,
      }),
    ).toBe(analyticsDisabled);
  });
});

describe('FCM/APNs push adapters', () => {
  it('FCM success returns delivered without exposing provider details to the port', async () => {
    const transport: jest.Mocked<FcmPushTransport> = {
      send: jest.fn().mockResolvedValue(undefined),
    };
    const adapter = new FcmPushNotificationAdapter(config({}), transport);

    await expect(adapter.send(MESSAGE)).resolves.toEqual({
      status: 'delivered',
    });
    expect(transport.send).toHaveBeenCalledWith({
      token: 'provider-token',
      type: 'friend_message',
    });
  });

  it('FCM failure is best-effort and never throws', async () => {
    const transport: jest.Mocked<FcmPushTransport> = {
      send: jest
        .fn()
        .mockRejectedValue(new Error('provider token must not be logged')),
    };
    const adapter = new FcmPushNotificationAdapter(config({}), transport);

    await expect(adapter.send(MESSAGE)).resolves.toEqual({ status: 'failed' });
  });

  it('APNs success returns delivered and missing token is skipped', async () => {
    const transport: jest.Mocked<ApnsPushTransport> = {
      send: jest.fn().mockResolvedValue(undefined),
    };
    const adapter = new ApnsPushNotificationAdapter(config({}), transport);

    await expect(adapter.send(MESSAGE)).resolves.toEqual({
      status: 'delivered',
    });
    await expect(
      adapter.send({ ...MESSAGE, deviceToken: undefined }),
    ).resolves.toEqual({ status: 'skipped' });
    expect(transport.send).toHaveBeenCalledTimes(1);
  });
});

describe('PostHog analytics adapter', () => {
  const posthogConfig = config({
    ANALYTICS_ENABLED: true,
    ANALYTICS_PROVIDER: 'posthog',
    POSTHOG_PROJECT_TOKEN: 'project-token',
    POSTHOG_HOST: 'https://eu.i.posthog.com',
    ANALYTICS_HTTP_TIMEOUT_MS: 1000,
  });

  afterEach(() => jest.restoreAllMocks());

  it('successful delivery posts only safe event properties', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
    } as Response);
    const adapter = new PostHogAnalyticsAdapter(posthogConfig);

    await expect(
      adapter.track({
        name: 'notification_push',
        distinctId: 'user-1',
        properties: {
          notification_type: 'friend_message',
          email: 'must-not-be-sent',
        },
      }),
    ).resolves.toBeUndefined();

    const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(request.properties).toMatchObject({
      notification_type: 'friend_message',
    });
    expect(request.properties.email).toBeUndefined();
  });

  it('provider failure is swallowed as a best-effort side effect', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('PostHog down'));
    const adapter = new PostHogAnalyticsAdapter(posthogConfig);

    await expect(
      adapter.track({ name: 'notification_push' }),
    ).resolves.toBeUndefined();
  });

  it('disabled adapter never performs delivery', async () => {
    const fetchMock = jest.spyOn(global, 'fetch');
    await expect(
      new DisabledAnalyticsAdapter().track({ name: 'ignored' }),
    ).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
