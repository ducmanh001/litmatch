import { signalingEnvSchema } from './env.validation';

describe('signalingEnvSchema invariants', () => {
  it('chấp nhận Redis TLS managed và từ chối protocol không phải Redis', () => {
    const schema = signalingEnvSchema.extract('REDIS_URL');
    expect(
      schema.validate('rediss://default:secret@redis.example:6379').error,
    ).toBeUndefined();
    expect(schema.validate('https://redis.example').error).toBeDefined();
  });
});
