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
  NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN: '',
  NEXT_PUBLIC_POSTHOG_HOST: '',
  GRAFANA_CLOUD_PROMETHEUS_URL: '',
  GRAFANA_CLOUD_PROMETHEUS_USER: '',
  GRAFANA_CLOUD_LOKI_URL: '',
  GRAFANA_CLOUD_LOKI_USER: '',
  GRAFANA_CLOUD_API_TOKEN: '',
};

test('release config hợp lệ tạo image tag và DATABASE_URL nội bộ từ một nguồn', () => {
  assert.deepEqual(validateReleaseConfig(validConfig), []);
  const env = createRuntimeEnv(validConfig, 'abc123');
  assert.equal(env.CORE_IMAGE, 'litmatch/core-api:abc123');
  assert.equal(
    env.DATABASE_URL,
    'postgresql://litmatch:safe_password-123@postgres:5432/litmatch',
  );
});

test('release config từ chối placeholder, secret ngắn và cấu hình hosted thiếu một nửa', () => {
  const errors = validateReleaseConfig({
    ...validConfig,
    DOMAIN: 'example.com',
    JWT_SECRET: 'short',
    GRAFANA_CLOUD_API_TOKEN: 'token',
  });
  assert.ok(errors.some((error) => error.includes('placeholder')));
  assert.ok(errors.some((error) => error.includes('JWT_SECRET')));
  assert.ok(errors.some((error) => error.includes('Grafana Cloud')));
});
