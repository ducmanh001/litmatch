import assert from 'node:assert/strict';
import test from 'node:test';

import { createRuntimeEnv, validateReleaseConfig } from './release-config.mjs';

const validConfig = {
  DOMAIN: 'litmatch.test',
  PUBLIC_IP: '198.51.100.20',
  ACME_EMAIL: 'owner@litmatch.test',
  GOOGLE_OAUTH_CLIENT_ID: 'client.apps.googleusercontent.com',
  POSTGRES_USER: 'litmatch',
  POSTGRES_PASSWORD: 'safe_password-123',
  POSTGRES_DB: 'litmatch',
  JWT_SECRET: 'j'.repeat(32),
  AUTH_OTP_PEPPER: 'p'.repeat(16),
  LIVEKIT_API_KEY: 'livekit-key',
  LIVEKIT_API_SECRET: 'l'.repeat(32),
  OBSERVABILITY_OWNER: 'platform-primary',
  SENTRY_CORE_API_DSN: 'https://public@sentry.invalid/1',
  SENTRY_SIGNALING_DSN: 'https://public@sentry.invalid/2',
  NEXT_PUBLIC_SENTRY_DSN: 'https://public@sentry.invalid/3',
  VITE_SENTRY_DSN: 'https://public@sentry.invalid/4',
  OTEL_EXPORTER_OTLP_ENDPOINT: 'https://otlp.example.net/v1/traces',
  OTEL_EXPORTER_OTLP_HEADERS: 'Authorization=Basic test',
  NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN: '',
  NEXT_PUBLIC_POSTHOG_HOST: '',
  GRAFANA_CLOUD_PROMETHEUS_URL: 'https://otlp.example.net/otlp',
  GRAFANA_CLOUD_PROMETHEUS_USER: 'metrics-user',
  GRAFANA_CLOUD_LOKI_URL: 'https://logs.example.net/loki/api/v1/push',
  GRAFANA_CLOUD_LOKI_USER: 'logs-user',
  GRAFANA_CLOUD_API_TOKEN: 'token',
  FACEBOOK_APP_ID: '',
  FACEBOOK_APP_SECRET: '',
  SENTRY_RELEASE: '',
};

test('release config hợp lệ tạo image tag và DATABASE_URL nội bộ từ một nguồn', () => {
  assert.deepEqual(validateReleaseConfig(validConfig), []);
  const env = createRuntimeEnv(validConfig, 'abc123');
  assert.equal(env.CORE_IMAGE, 'litmatch/core-api:abc123');
  assert.equal(
    env.DATABASE_URL,
    'postgresql://litmatch:safe_password-123@postgres:5432/litmatch',
  );
  assert.equal(env.SENTRY_RELEASE, 'abc123');
});

test('release config từ chối placeholder, secret ngắn và telemetry production bị thiếu', () => {
  const errors = validateReleaseConfig({
    ...validConfig,
    DOMAIN: 'example.com',
    JWT_SECRET: 'short',
    SENTRY_SIGNALING_DSN: '',
    FACEBOOK_APP_ID: 'facebook-app-id',
  });
  assert.ok(errors.some((error) => error.includes('placeholder')));
  assert.ok(errors.some((error) => error.includes('JWT_SECRET')));
  assert.ok(errors.some((error) => error.includes('SENTRY_SIGNALING_DSN')));
  assert.ok(errors.some((error) => error.includes('Facebook App ID')));
});
