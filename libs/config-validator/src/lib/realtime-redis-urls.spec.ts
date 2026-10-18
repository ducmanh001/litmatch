import { realtimeRedisUrlsSchema } from './realtime-redis-urls';

describe('realtimeRedisUrlsSchema', () => {
  const schema = realtimeRedisUrlsSchema(3);

  it('mặc định rỗng (một shard là REDIS_URL)', () => {
    expect(schema.validate(undefined).value).toBe('');
    expect(schema.validate('').error).toBeUndefined();
  });

  it('chấp nhận danh sách redis/rediss có khoảng trắng', () => {
    expect(
      schema.validate('redis://a:6379, rediss://default:pw@b.example:6380')
        .error,
    ).toBeUndefined();
  });

  it('từ chối URL không phải Redis, trùng nhau, hoặc vượt số shard tối đa', () => {
    expect(schema.validate('redis://a:6379,https://b').error).toBeDefined();
    expect(
      schema.validate('redis://a:6379,redis://a:6379').error,
    ).toBeDefined();
    expect(
      schema.validate('redis://a:1,redis://b:1,redis://c:1,redis://d:1').error,
    ).toBeDefined();
  });
});
