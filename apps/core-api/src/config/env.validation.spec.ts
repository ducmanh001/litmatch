import { coreApiEnvSchema } from './env.validation';

describe('coreApiEnvSchema invariants', () => {
  it('gift conversion phải nhỏ hơn 100% để không thành chuyển tiền ngang hàng', () => {
    const schema = coreApiEnvSchema.extract('GIFT_POINTS_RATE_PERCENT');
    expect(schema.validate(99).error).toBeUndefined();
    expect(schema.validate(100).error).toBeDefined();
  });

  it('store HTTP timeout có default hữu hạn và không nhận deadline quá thấp', () => {
    const schema = coreApiEnvSchema.extract('ECONOMY_STORE_HTTP_TIMEOUT_MS');
    expect(schema.validate(undefined).value).toBe(10_000);
    expect(schema.validate(99).error).toBeDefined();
  });

  it('chấp nhận Redis TLS managed và từ chối protocol không phải Redis', () => {
    const schema = coreApiEnvSchema.extract('REDIS_URL');
    expect(
      schema.validate('rediss://default:secret@redis.example:6379').error,
    ).toBeUndefined();
    expect(schema.validate('https://redis.example').error).toBeDefined();
  });

  it('pool Postgres mỗi pod mặc định 10, sàn 5 và nằm trong khoảng hữu hạn', () => {
    const schema = coreApiEnvSchema.extract('DATABASE_POOL_MAX');
    expect(schema.validate(undefined).value).toBe(10);
    expect(schema.validate(25).error).toBeUndefined();
    expect(schema.validate(5).error).toBeUndefined();
    expect(schema.validate(4).error).toBeDefined();
    expect(schema.validate(101).error).toBeDefined();
    expect(schema.validate(10.5).error).toBeDefined();
  });

  it('thời hạn chờ kết nối pool có mặc định hữu hạn và không nhận giá trị quá thấp', () => {
    const schema = coreApiEnvSchema.extract('DATABASE_POOL_ACQUIRE_TIMEOUT_MS');
    expect(schema.validate(undefined).value).toBe(10_000);
    expect(schema.validate(999).error).toBeDefined();
    expect(schema.validate(120_001).error).toBeDefined();
  });

  it('throttle storage mặc định memory và chỉ nhận memory hoặc redis', () => {
    const schema = coreApiEnvSchema.extract('THROTTLE_STORAGE');
    expect(schema.validate(undefined).value).toBe('memory');
    expect(schema.validate('redis').error).toBeUndefined();
    expect(schema.validate('memcached').error).toBeDefined();
  });

  it('JWT_SECRET_PREVIOUS tắt theo mặc định, đủ dài và không được trùng khoá hiện tại', () => {
    const current = 'c'.repeat(40);
    const previousError = (value: unknown) =>
      coreApiEnvSchema
        .validate(
          { JWT_SECRET: current, JWT_SECRET_PREVIOUS: value },
          { abortEarly: false, allowUnknown: true },
        )
        .error?.details.find((d) => d.path[0] === 'JWT_SECRET_PREVIOUS');

    expect(previousError(undefined)).toBeUndefined();
    expect(previousError('')).toBeUndefined();
    expect(previousError('p'.repeat(40))).toBeUndefined();
    expect(previousError('p'.repeat(31))).toBeDefined();
    expect(previousError(current)).toBeDefined();
  });

  it('verifier store bắt buộc có ECONOMY_APPLE_BUNDLE_ID, các chế độ khác thì cho rỗng', () => {
    const bundleIdError = (env: Record<string, unknown>) =>
      coreApiEnvSchema
        .validate(env, { abortEarly: false, allowUnknown: true })
        .error?.details.find((d) => d.path[0] === 'ECONOMY_APPLE_BUNDLE_ID');

    expect(bundleIdError({ ECONOMY_IAP_VERIFIER: 'store' })).toBeDefined();
    expect(
      bundleIdError({
        ECONOMY_IAP_VERIFIER: 'store',
        ECONOMY_APPLE_BUNDLE_ID: '',
      }),
    ).toBeDefined();
    expect(
      bundleIdError({
        ECONOMY_IAP_VERIFIER: 'store',
        ECONOMY_APPLE_BUNDLE_ID: 'com.litmatch.app',
      }),
    ).toBeUndefined();
    expect(bundleIdError({ ECONOMY_IAP_VERIFIER: 'dev' })).toBeUndefined();
    expect(
      bundleIdError({
        ECONOMY_IAP_VERIFIER: 'disabled',
        ECONOMY_APPLE_BUNDLE_ID: '',
      }),
    ).toBeUndefined();
    expect(bundleIdError({})).toBeUndefined();
  });

  it('cookie production chỉ nhận policy SameSite đã review', () => {
    const schema = coreApiEnvSchema.extract('AUTH_COOKIE_SAME_SITE');
    expect(schema.validate(undefined).value).toBe('strict');
    expect(schema.validate('none').error).toBeUndefined();
    expect(schema.validate('lax').error).toBeDefined();
  });

  it('Sentry DSN is opt-in but must be an HTTP(S) endpoint when enabled', () => {
    const schema = coreApiEnvSchema.extract('SENTRY_DSN');
    expect(schema.validate(undefined).value).toBe('');
    expect(
      schema.validate('https://public@example.ingest.sentry.io/1').error,
    ).toBeUndefined();
    expect(schema.validate('not-a-dsn').error).toBeDefined();
  });

  it('maintenance capability chỉ nhận identifier do contract công bố', () => {
    const schema = coreApiEnvSchema.extract('CAPABILITY_MAINTENANCE_FEATURES');
    expect(schema.validate('auth.google,topUp.web').error).toBeUndefined();
    expect(schema.validate('wallet.magicTopup').error).toBeDefined();
  });

  it('chấp nhận các storage profile S3-compatible và endpoint chỉ nhận HTTP(S)', () => {
    const providerSchema = coreApiEnvSchema.extract('MEDIA_STORAGE_PROVIDER');
    const endpointSchema = coreApiEnvSchema.extract('AWS_S3_ENDPOINT');

    expect(providerSchema.validate('s3').error).toBeUndefined();
    expect(providerSchema.validate('minio').error).toBeUndefined();
    expect(endpointSchema.validate('http://minio:9000').error).toBeUndefined();
    expect(
      endpointSchema.validate('ftp://storage.example').error,
    ).toBeDefined();
  });

  it('video upload mặc định tắt khi provider production chưa có', () => {
    const schema = coreApiEnvSchema.extract('VIDEO_UPLOAD_ENABLED');

    expect(schema.validate(undefined).value).toBe(false);
    expect(schema.validate(true).error).toBeUndefined();
  });

  it('notification and analytics provider flags are explicit and fail closed by default', () => {
    const push = coreApiEnvSchema.extract('NOTIFICATION_PUSH_PROVIDER');
    const analytics = coreApiEnvSchema.extract('ANALYTICS_PROVIDER');
    const enabled = coreApiEnvSchema.extract('ANALYTICS_ENABLED');

    expect(push.validate(undefined).value).toBe('dev');
    expect(push.validate('apns').error).toBeUndefined();
    expect(push.validate('unknown').error).toBeDefined();
    expect(analytics.validate(undefined).value).toBe('disabled');
    expect(enabled.validate(undefined).value).toBe(false);
  });
});
