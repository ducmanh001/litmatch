import { signalingEnvSchema } from './env.validation';

describe('signalingEnvSchema invariants', () => {
  it('chấp nhận Redis TLS managed và từ chối protocol không phải Redis', () => {
    const schema = signalingEnvSchema.extract('REDIS_URL');
    expect(
      schema.validate('rediss://default:secret@redis.example:6379').error,
    ).toBeUndefined();
    expect(schema.validate('https://redis.example').error).toBeDefined();
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
