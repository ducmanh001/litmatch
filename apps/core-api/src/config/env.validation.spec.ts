import Joi from 'joi';

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

  it('shard Redis realtime mặc định rỗng (một shard = REDIS_URL), từ chối URL sai hoặc trùng', () => {
    const schema = coreApiEnvSchema.extract('REALTIME_REDIS_URLS');
    expect(schema.validate(undefined).value).toBe('');
    expect(
      schema.validate('redis://a:6379,rediss://default:pw@b:6380').error,
    ).toBeUndefined();
    expect(schema.validate('redis://a:6379,https://b').error).toBeDefined();
    expect(
      schema.validate('redis://a:6379,redis://a:6379').error,
    ).toBeDefined();
  });

  describe('retention dữ liệu vận hành (ADR 0013)', () => {
    const value = (key: string, input?: unknown) =>
      coreApiEnvSchema.extract(key).validate(input);

    it('mặc định tắt (off): không job nào chạy cho tới khi chủ hệ thống bật', () => {
      expect(value('RETENTION_MODE').value).toBe('off');
      expect(value('RETENTION_MODE', 'dry-run').error).toBeUndefined();
      expect(value('RETENTION_MODE', 'delete').error).toBeUndefined();
      expect(value('RETENTION_MODE', 'on').error).toBeDefined();
    });

    it('mặc định hạn giữ: notification đã đọc 90 ngày, chưa đọc 365 ngày', () => {
      expect(value('NOTIFICATION_READ_RETENTION_DAYS').value).toBe(90);
      expect(value('NOTIFICATION_UNREAD_RETENTION_DAYS').value).toBe(365);
    });

    it('số ngày 0 = giữ vĩnh viễn hợp lệ; âm, thập phân hoặc > 10 năm bị từ chối', () => {
      for (const key of [
        'NOTIFICATION_READ_RETENTION_DAYS',
        'NOTIFICATION_UNREAD_RETENTION_DAYS',
      ]) {
        expect(value(key, 0).error).toBeUndefined();
        expect(value(key, -1).error).toBeDefined();
        expect(value(key, 1.5).error).toBeDefined();
        expect(value(key, 3_651).error).toBeDefined();
      }
    });

    it('lô và tần suất có mặc định hữu hạn và nằm trong khoảng an toàn', () => {
      expect(value('RETENTION_INTERVAL_MS').value).toBe(60_000);
      expect(value('RETENTION_INTERVAL_MS', 9_999).error).toBeDefined();
      expect(value('RETENTION_BATCH_SIZE').value).toBe(5_000);
      expect(value('RETENTION_BATCH_SIZE', 99).error).toBeDefined();
      expect(value('RETENTION_BATCH_SIZE', 50_001).error).toBeDefined();
      expect(value('RETENTION_MAX_BATCHES_PER_TICK').value).toBe(20);
      expect(value('RETENTION_MAX_BATCHES_PER_TICK', 0).error).toBeDefined();
      expect(value('RETENTION_BATCH_PAUSE_MS').value).toBe(50);
      expect(value('RETENTION_BATCH_PAUSE_MS', 0).error).toBeUndefined();
      expect(value('RETENTION_BATCH_PAUSE_MS', 5_001).error).toBeDefined();
    });
  });

  describe('short-video: ranking và counter đệm (ADR 0013)', () => {
    const value = (key: string, input?: unknown) =>
      coreApiEnvSchema.extract(key).validate(input);

    it('ranking: lô và số lô mỗi tick có mặc định hữu hạn, trong khoảng an toàn', () => {
      expect(value('VIDEO_RANKING_BATCH_SIZE').value).toBe(2_000);
      expect(value('VIDEO_RANKING_BATCH_SIZE', 99).error).toBeDefined();
      expect(value('VIDEO_RANKING_BATCH_SIZE', 20_001).error).toBeDefined();
      expect(value('VIDEO_RANKING_MAX_BATCHES_PER_TICK').value).toBe(5);
      expect(
        value('VIDEO_RANKING_MAX_BATCHES_PER_TICK', 0).error,
      ).toBeDefined();
      expect(
        value('VIDEO_RANKING_MAX_BATCHES_PER_TICK', 101).error,
      ).toBeDefined();
      expect(value('VIDEO_RANKING_STALENESS_PCT').value).toBe(1);
      expect(value('VIDEO_RANKING_STALENESS_PCT', 0.05).error).toBeDefined();
      expect(value('VIDEO_RANKING_STALENESS_PCT', 51).error).toBeDefined();
      expect(value('VIDEO_RANKING_MAX_INTERVAL_HOURS').value).toBe(168);
      expect(value('VIDEO_RANKING_MAX_INTERVAL_HOURS', 0).error).toBeDefined();
      expect(value('VIDEO_RANKING_ACTIVE_REFRESH_SECONDS').value).toBe(600);
      expect(
        value('VIDEO_RANKING_ACTIVE_REFRESH_SECONDS', 59).error,
      ).toBeDefined();
    });

    it('counter đệm tắt mặc định (cộng thẳng vào DB như trước); chu kỳ flush và lô bị chặn khoảng', () => {
      expect(value('VIDEO_COUNTER_BUFFER_ENABLED').value).toBe(false);
      expect(value('VIDEO_COUNTER_BUFFER_ENABLED', true).error).toBeUndefined();
      expect(value('VIDEO_COUNTER_FLUSH_INTERVAL_MS').value).toBe(2_000);
      expect(value('VIDEO_COUNTER_FLUSH_INTERVAL_MS', 499).error).toBeDefined();
      expect(
        value('VIDEO_COUNTER_FLUSH_INTERVAL_MS', 60_001).error,
      ).toBeDefined();
      expect(value('VIDEO_COUNTER_FLUSH_BATCH').value).toBe(500);
      expect(value('VIDEO_COUNTER_FLUSH_BATCH', 9).error).toBeDefined();
      expect(value('VIDEO_COUNTER_FLUSH_BATCH', 5_001).error).toBeDefined();
    });
  });

  describe('đối soát ledger tăng dần (ADR 0013)', () => {
    const value = (key: string, input?: unknown) =>
      coreApiEnvSchema.extract(key).validate(input);

    it('LAG mặc định 5 phút và chu kỳ dựng lại mặc định 1 ngày; cả hai bị chặn khoảng an toàn', () => {
      expect(value('ECONOMY_RECONCILIATION_LAG_MS').value).toBe(300_000);
      expect(value('ECONOMY_RECONCILIATION_LAG_MS', 0).error).toBeUndefined();
      expect(value('ECONOMY_RECONCILIATION_LAG_MS', -1).error).toBeDefined();
      expect(
        value('ECONOMY_RECONCILIATION_LAG_MS', 3_600_001).error,
      ).toBeDefined();
      expect(value('ECONOMY_RECONCILIATION_FULL_INTERVAL_MS').value).toBe(
        86_400_000,
      );
      expect(
        value('ECONOMY_RECONCILIATION_FULL_INTERVAL_MS', 3_599_999).error,
      ).toBeDefined();
    });
  });

  describe('vòng đời dữ liệu (ADR 0014)', () => {
    const value = (key: string, input?: unknown) =>
      coreApiEnvSchema.extract(key).validate(input);

    it('mặc định đúng khuyến nghị, 0 = giữ vĩnh viễn, âm hoặc quá trần bị chặn', () => {
      const defaults: Array<[string, number]> = [
        ['AUTH_REFRESH_RETENTION_GRACE_DAYS', 7],
        ['AUTH_REFRESH_ROTATED_RETENTION_DAYS', 0],
        ['AUTH_OTP_RETENTION_DAYS', 1],
        ['MATCHING_QUOTA_RETENTION_DAYS', 2],
        ['OUTBOX_PUBLISHED_RETENTION_DAYS', 7],
        ['OUTBOX_DEAD_LETTER_RETENTION_DAYS', 0],
        ['VIDEO_VIEW_RETENTION_DAYS', 0],
        ['VIDEO_DELETED_COMMENT_RETENTION_DAYS', 30],
        ['MOOD_EVENT_RETENTION_DAYS', 7],
      ];
      for (const [key, expected] of defaults) {
        expect(value(key).value).toBe(expected);
        expect(value(key, 0).error).toBeUndefined();
        expect(value(key, -1).error).toBeDefined();
      }
      expect(value('AUTH_OTP_RETENTION_DAYS', 366).error).toBeDefined();
      expect(value('VIDEO_VIEW_RETENTION_DAYS', 3_651).error).toBeDefined();
    });
  });

  describe('admin broadcast chạy nền (ADR 0013)', () => {
    const value = (key: string, input?: unknown) =>
      coreApiEnvSchema.extract(key).validate(input);

    it('chu kỳ, lô và số lô mỗi tick có mặc định hữu hạn và bị chặn khoảng an toàn', () => {
      expect(value('ADMIN_BROADCAST_JOB_INTERVAL_MS').value).toBe(2_000);
      expect(value('ADMIN_BROADCAST_JOB_INTERVAL_MS', 499).error).toBeDefined();
      expect(
        value('ADMIN_BROADCAST_JOB_INTERVAL_MS', 60_001).error,
      ).toBeDefined();
      expect(value('ADMIN_BROADCAST_BATCH_SIZE').value).toBe(500);
      expect(value('ADMIN_BROADCAST_BATCH_SIZE', 9).error).toBeDefined();
      expect(value('ADMIN_BROADCAST_BATCH_SIZE', 1_001).error).toBeDefined();
      expect(value('ADMIN_BROADCAST_MAX_BATCHES_PER_TICK').value).toBe(20);
      expect(
        value('ADMIN_BROADCAST_MAX_BATCHES_PER_TICK', 0).error,
      ).toBeDefined();
      expect(
        value('ADMIN_BROADCAST_MAX_BATCHES_PER_TICK', 201).error,
      ).toBeDefined();
    });
  });

  describe('giao mã OTP (ADR 0013)', () => {
    // Chỉ các khoá liên quan: `when` tham chiếu NODE_ENV/AUTH_OTP_DELIVERY cần có anh em trong cùng object.
    const otpEnvSchema = Joi.object({
      NODE_ENV: coreApiEnvSchema.extract('NODE_ENV'),
      AUTH_OTP_DELIVERY: coreApiEnvSchema.extract('AUTH_OTP_DELIVERY'),
      AUTH_OTP_SMS_HTTP_URL: coreApiEnvSchema.extract('AUTH_OTP_SMS_HTTP_URL'),
      AUTH_OTP_SMS_TEMPLATE: coreApiEnvSchema.extract('AUTH_OTP_SMS_TEMPLATE'),
    });

    it('mặc định response ở mọi môi trường (không khoá đăng nhập deployment đang chạy); production đặt sms-http/disabled để đóng lỗ hổng', () => {
      for (const nodeEnv of ['development', 'test', 'production']) {
        expect(
          otpEnvSchema.validate({ NODE_ENV: nodeEnv }).value.AUTH_OTP_DELIVERY,
        ).toBe('response');
      }
      for (const delivery of ['sms-http', 'disabled']) {
        expect(
          otpEnvSchema.validate({
            NODE_ENV: 'production',
            AUTH_OTP_DELIVERY: delivery,
            AUTH_OTP_SMS_HTTP_URL: 'https://sms.example/send',
          }).value.AUTH_OTP_DELIVERY,
        ).toBe(delivery);
      }
    });

    it('chỉ nhận response | sms-http | disabled', () => {
      expect(
        otpEnvSchema.validate({ AUTH_OTP_DELIVERY: 'sms' }).error,
      ).toBeDefined();
    });

    it('sms-http bắt buộc có URL; production bắt buộc https, dev nhận cả http', () => {
      const smsProd = { NODE_ENV: 'production', AUTH_OTP_DELIVERY: 'sms-http' };
      expect(otpEnvSchema.validate(smsProd).error).toBeDefined();
      expect(
        otpEnvSchema.validate({ ...smsProd, AUTH_OTP_SMS_HTTP_URL: '' }).error,
      ).toBeDefined();
      expect(
        otpEnvSchema.validate({
          ...smsProd,
          AUTH_OTP_SMS_HTTP_URL: 'http://sms.internal/send',
        }).error,
      ).toBeDefined();
      expect(
        otpEnvSchema.validate({
          ...smsProd,
          AUTH_OTP_SMS_HTTP_URL: 'https://sms.example/send',
        }).error,
      ).toBeUndefined();
      const smsDev = { NODE_ENV: 'development', AUTH_OTP_DELIVERY: 'sms-http' };
      expect(
        otpEnvSchema.validate({
          ...smsDev,
          AUTH_OTP_SMS_HTTP_URL: 'http://127.0.0.1:9000/send',
        }).error,
      ).toBeUndefined();
    });

    it('URL cổng SMS có thể để trống khi không dùng sms-http', () => {
      expect(
        otpEnvSchema.validate({ NODE_ENV: 'production' }).error,
      ).toBeUndefined();
      expect(
        otpEnvSchema.validate({ NODE_ENV: 'production' }).value
          .AUTH_OTP_SMS_HTTP_URL,
      ).toBe('');
    });

    it('mẫu SMS phải chứa {code} và có mặc định hợp lệ', () => {
      const value = otpEnvSchema.validate({}).value;
      expect(value.AUTH_OTP_SMS_TEMPLATE).toContain('{code}');
      expect(
        otpEnvSchema.validate({
          AUTH_OTP_SMS_TEMPLATE: 'Ma cua ban la 123456 het han',
        }).error,
      ).toBeDefined();
      expect(
        otpEnvSchema.validate({
          AUTH_OTP_SMS_TEMPLATE: 'Ma OTP la {code} (hieu luc {minutes} phut)',
        }).error,
      ).toBeUndefined();
    });

    it('timeout cổng SMS có mặc định hữu hạn và không nhận giá trị quá thấp/cao', () => {
      const schema = coreApiEnvSchema.extract('AUTH_OTP_SMS_HTTP_TIMEOUT_MS');
      expect(schema.validate(undefined).value).toBe(3_000);
      expect(schema.validate(499).error).toBeDefined();
      expect(schema.validate(10_001).error).toBeDefined();
    });
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

  it('JWT_SECRET_PREVIOUS tắt theo mặc định, đủ dài và không trùng khoá hiện tại hay khoá guest device', () => {
    const current = 'c'.repeat(40);
    const guest = 'g'.repeat(40);
    const previousError = (value: unknown) =>
      coreApiEnvSchema
        .validate(
          {
            JWT_SECRET: current,
            AUTH_GUEST_DEVICE_TOKEN_SECRET: guest,
            JWT_SECRET_PREVIOUS: value,
          },
          { abortEarly: false, allowUnknown: true },
        )
        .error?.details.find((d) => d.path[0] === 'JWT_SECRET_PREVIOUS');

    expect(previousError(undefined)).toBeUndefined();
    expect(previousError('')).toBeUndefined();
    expect(previousError('p'.repeat(40))).toBeUndefined();
    expect(previousError('p'.repeat(31))).toBeDefined();
    expect(previousError(current)).toBeDefined();
    expect(previousError(guest)).toBeDefined();
  });

  it('ECONOMY_APPLE_BUNDLE_ID bắt buộc khi IAP verifier=store hoặc khi webhook store có Apple Root CA', () => {
    const bundleIdError = (env: Record<string, unknown>) =>
      coreApiEnvSchema
        .validate(env, { abortEarly: false, allowUnknown: true })
        .error?.details.find((d) => d.path[0] === 'ECONOMY_APPLE_BUNDLE_ID');
    const CA = '-----BEGIN CERTIFICATE-----';

    // IAP store: luôn bắt buộc
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

    // IAP tắt nhưng webhook Apple thật (store + Root CA): vẫn bắt buộc
    expect(
      bundleIdError({
        ECONOMY_IAP_VERIFIER: 'disabled',
        ECONOMY_APPLE_WEBHOOK_VERIFIER: 'store',
        ECONOMY_APPLE_ROOT_CA_PEM: CA,
        ECONOMY_APPLE_BUNDLE_ID: '',
      }),
    ).toBeDefined();
    expect(
      bundleIdError({
        ECONOMY_IAP_VERIFIER: 'disabled',
        ECONOMY_APPLE_WEBHOOK_VERIFIER: 'store',
        ECONOMY_APPLE_ROOT_CA_PEM: CA,
        ECONOMY_APPLE_BUNDLE_ID: 'com.litmatch.app',
      }),
    ).toBeUndefined();

    // webhook chưa thể xác thực chữ ký (không có Root CA) hoặc ở chế độ dev: cho rỗng
    expect(
      bundleIdError({
        ECONOMY_IAP_VERIFIER: 'disabled',
        ECONOMY_APPLE_WEBHOOK_VERIFIER: 'store',
        ECONOMY_APPLE_ROOT_CA_PEM: '',
      }),
    ).toBeUndefined();
    expect(
      bundleIdError({
        ECONOMY_IAP_VERIFIER: 'disabled',
        ECONOMY_APPLE_WEBHOOK_VERIFIER: 'dev',
        ECONOMY_APPLE_ROOT_CA_PEM: CA,
      }),
    ).toBeUndefined();
    expect(bundleIdError({ ECONOMY_IAP_VERIFIER: 'dev' })).toBeUndefined();
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
