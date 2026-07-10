import { validateCoreApiEnv } from './env.validation';

const BASE = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/litmatch',
  JWT_SECRET: 'x'.repeat(32),
  AUTH_OTP_PEPPER: 'p'.repeat(16),
};

const PRODUCTION_STORE = {
  ...BASE,
  NODE_ENV: 'production',
  ECONOMY_IAP_VERIFIER: 'store',
  ECONOMY_APPLE_SHARED_SECRET: 'apple-secret',
  ECONOMY_GOOGLE_PACKAGE_NAME: 'com.litmatch.app',
  ECONOMY_GOOGLE_SA_EMAIL: 'play-api@project.iam.gserviceaccount.com',
  ECONOMY_GOOGLE_SA_PRIVATE_KEY: 'private-key',
  ECONOMY_APPLE_WEBHOOK_VERIFIER: 'store',
  ECONOMY_APPLE_ROOT_CA_PEM: 'root-cert',
  ECONOMY_APPLE_BUNDLE_ID: 'com.litmatch.app',
  ECONOMY_GOOGLE_RTDN_VERIFIER: 'store',
  ECONOMY_GOOGLE_RTDN_AUDIENCE: 'https://api.example.com/api/v1/economy/webhooks/google/rtdn',
  ECONOMY_GOOGLE_RTDN_SERVICE_ACCOUNT_EMAIL: 'push@project.iam.gserviceaccount.com',
};

describe('core-api production env validation', () => {
  it('local/test default các verifier dev', () => {
    const config = validateCoreApiEnv({ ...BASE, NODE_ENV: 'test' });
    expect(config['ECONOMY_IAP_VERIFIER']).toBe('dev');
    expect(config['ECONOMY_APPLE_WEBHOOK_VERIFIER']).toBe('dev');
    expect(config['ECONOMY_GOOGLE_RTDN_VERIFIER']).toBe('dev');
    expect(config['SAFETY_REPORT_MAX_PER_HOUR']).toBe(5);
  });

  it('production chỉ chấp nhận store verifier', () => {
    expect(() =>
      validateCoreApiEnv({
        ...PRODUCTION_STORE,
        ECONOMY_IAP_VERIFIER: 'dev',
        ECONOMY_APPLE_WEBHOOK_VERIFIER: 'dev',
        ECONOMY_GOOGLE_RTDN_VERIFIER: 'dev',
      }),
    ).toThrow(/ECONOMY_(IAP|APPLE|GOOGLE)/);
  });

  it('store mode fail-fast khi thiếu credential bắt buộc', () => {
    expect(() =>
      validateCoreApiEnv({
        ...PRODUCTION_STORE,
        ECONOMY_GOOGLE_SA_PRIVATE_KEY: '',
        ECONOMY_APPLE_ROOT_CA_PEM: '',
      }),
    ).toThrow(/ECONOMY_(GOOGLE_SA_PRIVATE_KEY|APPLE_ROOT_CA_PEM)/);
  });

  it('production store cấu hình đủ thì bootstrap validation qua', () => {
    expect(validateCoreApiEnv(PRODUCTION_STORE)['NODE_ENV']).toBe('production');
  });
});
