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
});
