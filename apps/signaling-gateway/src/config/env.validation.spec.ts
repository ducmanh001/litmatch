import { signalingEnvSchema } from './env.validation';

describe('signalingEnvSchema invariants', () => {
  it.each([
    ['WS_MAX_CONNECTIONS_PER_PROCESS', 2_000, 1, 100_000],
    ['WS_MAX_CONCURRENT_HANDSHAKES', 64, 1, 1_024],
    ['WS_OUTBOUND_MAX_PACKETS', 128, 1, 4096],
    ['WS_OUTBOUND_MAX_BYTES', 1_048_576, 1024, 16_777_216],
    ['WS_OUTBOUND_TOTAL_MAX_PACKETS', 16_384, 1, 1_000_000],
    ['WS_OUTBOUND_TOTAL_MAX_BYTES', 134_217_728, 1024, 1_073_741_824],
  ] as const)(
    '%s has a bounded positive integer budget',
    (key, fallback, min, max) => {
      const schema = signalingEnvSchema.extract(key);
      expect(schema.validate(undefined).value).toBe(fallback);
      expect(schema.validate(min).error).toBeUndefined();
      expect(schema.validate(max).error).toBeUndefined();
      for (const invalid of [0, min - 1, max + 1, 1.5, 'unlimited']) {
        expect(schema.validate(invalid).error).toBeDefined();
      }
    },
  );
  it('chấp nhận Redis TLS managed và từ chối protocol không phải Redis', () => {
    const schema = signalingEnvSchema.extract('REDIS_URL');
    expect(
      schema.validate('rediss://default:secret@redis.example:6379').error,
    ).toBeUndefined();
    expect(schema.validate('https://redis.example').error).toBeDefined();
  });

  it('fanout mặc định theo user, một shard Redis, gia hạn lease = lease/3', () => {
    expect(
      signalingEnvSchema.extract('WS_FANOUT_MODE').validate(undefined).value,
    ).toBe('user');
    expect(
      signalingEnvSchema.extract('WS_FANOUT_MODE').validate('pattern').error,
    ).toBeUndefined();
    expect(
      signalingEnvSchema.extract('WS_FANOUT_MODE').validate('broadcast').error,
    ).toBeDefined();
    expect(
      signalingEnvSchema.extract('REALTIME_REDIS_URLS').validate(undefined)
        .value,
    ).toBe('');
    expect(
      signalingEnvSchema
        .extract('REALTIME_REDIS_URLS')
        .validate('redis://a:6379,redis://b:6379').error,
    ).toBeUndefined();
    expect(
      signalingEnvSchema
        .extract('REALTIME_REDIS_URLS')
        .validate('redis://a:6379,redis://a:6379').error,
    ).toBeDefined();
    expect(
      signalingEnvSchema
        .extract('WS_CONNECTION_LEASE_REFRESH_MS')
        .validate(undefined).value,
    ).toBe(0);
  });

  it('quota connection có default an toàn và từ chối lease quá ngắn', () => {
    expect(
      signalingEnvSchema
        .extract('WS_MAX_CONNECTIONS_PER_USER')
        .validate(undefined).value,
    ).toBe(3);
    expect(
      signalingEnvSchema.extract('WS_CONNECTION_LEASE_MS').validate(undefined)
        .value,
    ).toBe(90_000);
    expect(
      signalingEnvSchema.extract('WS_CONNECTION_LEASE_MS').validate(9_999)
        .error,
    ).toBeDefined();
    expect(
      signalingEnvSchema.extract('WS_MAX_CONNECTIONS_PER_USER').validate(4)
        .error,
    ).toBeDefined();
    expect(
      signalingEnvSchema.extract('WS_CONNECTION_LEASE_MS').validate(300_001)
        .error,
    ).toBeDefined();
  });
});
