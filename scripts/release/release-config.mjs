import { readFileSync } from 'node:fs';

export const REQUIRED_RELEASE_KEYS = [
  'DOMAIN',
  'PUBLIC_IP',
  'ACME_EMAIL',
  'GOOGLE_OAUTH_CLIENT_ID',
  'POSTGRES_USER',
  'POSTGRES_PASSWORD',
  'POSTGRES_DB',
  'JWT_SECRET',
  'AUTH_OTP_PEPPER',
  'LIVEKIT_API_KEY',
  'LIVEKIT_API_SECRET',
];

export function parseEnvFile(path) {
  const values = {};
  for (const [index, originalLine] of readFileSync(path, 'utf8')
    .split(/\r?\n/u)
    .entries()) {
    const line = originalLine.trim();
    if (line === '' || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator <= 0) {
      throw new Error(`Env line ${index + 1} không có dạng KEY=value`);
    }
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

export function validateReleaseConfig(values) {
  const errors = [];
  for (const key of REQUIRED_RELEASE_KEYS) {
    if (values[key] === undefined || values[key] === '') {
      errors.push(`${key} là bắt buộc`);
    }
  }

  if (
    !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/u.test(
      values.DOMAIN ?? '',
    )
  ) {
    errors.push('DOMAIN phải là hostname gốc, không kèm protocol/path');
  }
  if (!/^(?:\d{1,3}\.){3}\d{1,3}$/u.test(values.PUBLIC_IP ?? '')) {
    errors.push('PUBLIC_IP phải là IPv4 public của VM');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(values.ACME_EMAIL ?? '')) {
    errors.push('ACME_EMAIL không hợp lệ');
  }
  if (!/^[A-Za-z0-9_-]+$/u.test(values.POSTGRES_PASSWORD ?? '')) {
    errors.push('POSTGRES_PASSWORD chỉ được dùng A-Z/a-z/0-9/_/-');
  }
  if ((values.JWT_SECRET ?? '').length < 32) {
    errors.push('JWT_SECRET phải dài ít nhất 32 ký tự');
  }
  if ((values.AUTH_OTP_PEPPER ?? '').length < 16) {
    errors.push('AUTH_OTP_PEPPER phải dài ít nhất 16 ký tự');
  }
  if ((values.LIVEKIT_API_SECRET ?? '').length < 32) {
    errors.push('LIVEKIT_API_SECRET phải dài ít nhất 32 ký tự');
  }
  for (const [key, value] of Object.entries(values)) {
    if (/replace|example\.com|203\.0\.113\.10/iu.test(value)) {
      errors.push(`${key} vẫn là placeholder`);
    }
  }

  const posthog = [
    values.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN,
    values.NEXT_PUBLIC_POSTHOG_HOST,
  ].filter(Boolean);
  if (posthog.length === 1) {
    errors.push('Hai biến PostHog phải cùng có giá trị hoặc cùng để trống');
  }

  const grafanaKeys = [
    'GRAFANA_CLOUD_PROMETHEUS_URL',
    'GRAFANA_CLOUD_PROMETHEUS_USER',
    'GRAFANA_CLOUD_LOKI_URL',
    'GRAFANA_CLOUD_LOKI_USER',
    'GRAFANA_CLOUD_API_TOKEN',
  ];
  const grafanaCount = grafanaKeys.filter((key) => Boolean(values[key])).length;
  if (grafanaCount !== 0 && grafanaCount !== grafanaKeys.length) {
    errors.push(
      'Năm biến Grafana Cloud phải cùng có giá trị hoặc cùng để trống',
    );
  }

  return errors;
}

export function createRuntimeEnv(values, releaseTag) {
  const databaseUrl = `postgresql://${encodeURIComponent(values.POSTGRES_USER)}:${encodeURIComponent(values.POSTGRES_PASSWORD)}@postgres:5432/${encodeURIComponent(values.POSTGRES_DB)}`;
  return {
    ...process.env,
    ...values,
    DATABASE_URL: databaseUrl,
    CORE_IMAGE: `litmatch/core-api:${releaseTag}`,
    SIGNALING_IMAGE: `litmatch/signaling-gateway:${releaseTag}`,
    WEB_IMAGE: `litmatch/web:${releaseTag}`,
    EDGE_IMAGE: `litmatch/edge:${releaseTag}`,
  };
}
