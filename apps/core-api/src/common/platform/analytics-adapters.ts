import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { CoreApiEnv } from '../../config/env.validation';
import { POSTHOG_CAPTURE_PATH } from './platform.constants';
import {
  AnalyticsPort,
  type AnalyticsEvent,
  type AnalyticsPropertyValue,
} from './analytics.port';

const SENSITIVE_ANALYTICS_KEY =
  /(token|secret|password|otp|receipt|private|payload|content|message|email|phone|ip)/iu;

function safeProperties(
  properties: Readonly<Record<string, AnalyticsPropertyValue>> | undefined,
): Record<string, AnalyticsPropertyValue> {
  if (properties === undefined) return {};
  return Object.fromEntries(
    Object.entries(properties).filter(
      ([key, value]) =>
        !SENSITIVE_ANALYTICS_KEY.test(key) &&
        (typeof value === 'string' ||
          typeof value === 'number' ||
          typeof value === 'boolean' ||
          value === null),
    ),
  );
}

@Injectable()
export class DisabledAnalyticsAdapter extends AnalyticsPort {
  async track(event: AnalyticsEvent): Promise<void> {
    void event;
  }
}

@Injectable()
export class PostHogAnalyticsAdapter
  extends AnalyticsPort
  implements OnApplicationBootstrap
{
  private readonly logger = new Logger(PostHogAnalyticsAdapter.name);

  constructor(private readonly config: ConfigService<CoreApiEnv, true>) {
    super();
  }

  onApplicationBootstrap(): void {
    const enabled = this.config.getOrThrow('ANALYTICS_ENABLED', {
      infer: true,
    });
    const provider = this.config.getOrThrow('ANALYTICS_PROVIDER', {
      infer: true,
    });
    if (enabled && provider === 'posthog') {
      this.assertConfiguration();
    }
  }

  async track(event: AnalyticsEvent): Promise<void> {
    try {
      const projectToken = this.config.getOrThrow('POSTHOG_PROJECT_TOKEN', {
        infer: true,
      });
      const host = this.config
        .getOrThrow('POSTHOG_HOST', { infer: true })
        .replace(/\/+$/u, '');
      const properties = safeProperties(event.properties);
      const response = await fetch(`${host}${POSTHOG_CAPTURE_PATH}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          api_key: projectToken,
          event: event.name,
          distinct_id: event.distinctId ?? 'litmatch-server',
          properties: {
            ...properties,
            $lib: 'litmatch-core-api',
          },
        }),
        signal: AbortSignal.timeout(
          this.config.getOrThrow('ANALYTICS_HTTP_TIMEOUT_MS', { infer: true }),
        ),
      });
      if (!response.ok) throw new Error('PostHog rejected the event');
    } catch {
      // Analytics is never allowed to fail the business action that emitted it.
      this.logger.warn('Analytics provider failed; event was ignored');
    }
  }

  private assertConfiguration(): void {
    const token = this.config.getOrThrow('POSTHOG_PROJECT_TOKEN', {
      infer: true,
    });
    const host = this.config.getOrThrow('POSTHOG_HOST', { infer: true });
    if (token === '' || host === '') {
      throw new Error(
        'ANALYTICS_PROVIDER=posthog requires POSTHOG_PROJECT_TOKEN and POSTHOG_HOST',
      );
    }
  }
}
