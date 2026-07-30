import { CapabilitiesService } from './capabilities.service';
import { CapabilityStatus } from './capabilities.dto';

const BASE_CONFIG = {
  NODE_ENV: 'development',
  CAPABILITY_MAINTENANCE_FEATURES: '',
  AUTH_PHONE_OTP_ENABLED: true,
  AUTH_GOOGLE_CLIENT_ID: 'google-client',
  AUTH_APPLE_CLIENT_ID: '',
  AUTH_FACEBOOK_APP_ID: 'facebook-app',
  AUTH_FACEBOOK_APP_SECRET: 'facebook-secret',
  PAYOS_CLIENT_ID: 'payos-client',
  PAYOS_API_KEY: 'payos-api-key',
  PAYOS_CHECKSUM_KEY: 'payos-checksum',
  PAYOS_WEB_WALLET_URL: 'https://app.example/wallet',
  PAYOS_RETURN_URL: '',
  PAYOS_CANCEL_URL: '',
  ECONOMY_IAP_VERIFIER: 'dev',
  ECONOMY_APPLE_SHARED_SECRET: '',
  ECONOMY_GOOGLE_PACKAGE_NAME: '',
  ECONOMY_GOOGLE_SA_EMAIL: '',
  ECONOMY_GOOGLE_SA_PRIVATE_KEY: '',
  VIDEO_UPLOAD_ENABLED: true,
  NOTIFICATION_PUSH_PROVIDER: 'dev',
} as const;

function createService(overrides: Record<string, unknown> = {}) {
  const config: Record<string, unknown> = { ...BASE_CONFIG, ...overrides };
  return new CapabilitiesService({
    getOrThrow: (key: string) => config[key],
  } as never);
}

describe('CapabilitiesService', () => {
  it('derives configured providers and marks development-only adapters beta', () => {
    const capabilities = createService().getCapabilities();

    expect(capabilities.auth.phoneOtp.status).toBe(CapabilityStatus.Beta);
    expect(capabilities.auth.google).toMatchObject({
      status: CapabilityStatus.Enabled,
      clientId: 'google-client',
    });
    expect(capabilities.auth.apple).toMatchObject({
      status: CapabilityStatus.Disabled,
      clientId: null,
    });
    expect(capabilities.topUp.web.status).toBe(CapabilityStatus.Enabled);
    expect(capabilities.topUp.native.status).toBe(CapabilityStatus.Beta);
    expect(capabilities.topUp.nativeApple.status).toBe(CapabilityStatus.Beta);
    expect(capabilities.topUp.nativeGoogle.status).toBe(CapabilityStatus.Beta);
    expect(capabilities.video.upload.status).toBe(CapabilityStatus.Beta);
    expect(capabilities.notifications.push.status).toBe(CapabilityStatus.Beta);
  });

  it('keeps response-delivered OTP usable and fails closed for dev-only adapters in production', () => {
    const capabilities = createService({
      NODE_ENV: 'production',
    }).getCapabilities();

    expect(capabilities.topUp.native.status).toBe(CapabilityStatus.Disabled);
    expect(capabilities.video.upload.status).toBe(CapabilityStatus.Disabled);
    expect(capabilities.video.transcode.status).toBe(CapabilityStatus.Disabled);
    expect(capabilities.notifications.push.status).toBe(
      CapabilityStatus.Disabled,
    );
    expect(capabilities.auth.phoneOtp.status).toBe(CapabilityStatus.Beta);
  });

  it('requires the complete payOS and Facebook configuration', () => {
    const capabilities = createService({
      PAYOS_CHECKSUM_KEY: '',
      AUTH_FACEBOOK_APP_SECRET: '',
    }).getCapabilities();

    expect(capabilities.topUp.web.status).toBe(CapabilityStatus.Disabled);
    expect(capabilities.auth.facebook).toMatchObject({
      status: CapabilityStatus.Disabled,
      clientId: null,
    });
  });

  it('store IAP chỉ enabled khi ít nhất một provider đủ credential', () => {
    expect(
      createService({
        NODE_ENV: 'production',
        ECONOMY_IAP_VERIFIER: 'store',
      }).getCapabilities().topUp.native.status,
    ).toBe(CapabilityStatus.Disabled);

    const capabilities = createService({
      NODE_ENV: 'production',
      ECONOMY_IAP_VERIFIER: 'store',
      ECONOMY_GOOGLE_PACKAGE_NAME: 'com.example.app',
      ECONOMY_GOOGLE_SA_EMAIL: 'iap@example.iam.gserviceaccount.com',
      ECONOMY_GOOGLE_SA_PRIVATE_KEY: 'private-key',
    }).getCapabilities();
    expect(capabilities.topUp.native).toMatchObject({
      status: CapabilityStatus.Disabled,
      message: expect.stringContaining('chỉ hỗ trợ thanh toán qua Google'),
    });
    expect(capabilities.topUp.nativeGoogle.status).toBe(
      CapabilityStatus.Enabled,
    );
    expect(capabilities.topUp.nativeApple.status).toBe(
      CapabilityStatus.Disabled,
    );
  });

  it('payOS chấp nhận wallet URL hoặc cặp return/cancel URL đầy đủ', () => {
    const capabilities = createService({
      PAYOS_WEB_WALLET_URL: '',
      PAYOS_RETURN_URL: 'https://app.example/payment-return',
      PAYOS_CANCEL_URL: 'https://app.example/payment-cancel',
    }).getCapabilities();

    expect(capabilities.topUp.web.status).toBe(CapabilityStatus.Enabled);
  });

  it('maintenance can degrade an available capability but cannot promote a disabled one', () => {
    const capabilities = createService({
      CAPABILITY_MAINTENANCE_FEATURES: 'auth.google,auth.apple,topUp.web',
    }).getCapabilities();

    expect(capabilities.auth.google.status).toBe(CapabilityStatus.Maintenance);
    expect(capabilities.topUp.web.status).toBe(CapabilityStatus.Maintenance);
    expect(capabilities.auth.apple.status).toBe(CapabilityStatus.Disabled);
  });

  it('native maintenance degrades each configured provider independently', () => {
    const capabilities = createService({
      NODE_ENV: 'production',
      ECONOMY_IAP_VERIFIER: 'store',
      ECONOMY_GOOGLE_PACKAGE_NAME: 'com.example.app',
      ECONOMY_GOOGLE_SA_EMAIL: 'iap@example.iam.gserviceaccount.com',
      ECONOMY_GOOGLE_SA_PRIVATE_KEY: 'private-key',
      CAPABILITY_MAINTENANCE_FEATURES: 'topUp.native',
    }).getCapabilities();

    expect(capabilities.topUp.native.status).toBe(CapabilityStatus.Disabled);
    expect(capabilities.topUp.nativeGoogle.status).toBe(
      CapabilityStatus.Maintenance,
    );
    expect(capabilities.topUp.nativeApple.status).toBe(
      CapabilityStatus.Disabled,
    );
  });
});
