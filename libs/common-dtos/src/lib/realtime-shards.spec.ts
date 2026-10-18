import { parseRealtimeRedisUrls, realtimeShardIndex } from './realtime-shards';

describe('realtimeShardIndex', () => {
  it('một shard (hoặc cấu hình không hợp lệ) luôn về shard 0', () => {
    expect(realtimeShardIndex('user-1', 1)).toBe(0);
    expect(realtimeShardIndex('user-1', 0)).toBe(0);
    expect(realtimeShardIndex('user-1', Number.NaN)).toBe(0);
  });

  // Known-vectors: đổi hàm hash = đổi chỗ của MỌI user giữa core-api và signaling-gateway. Test
  // này phải đỏ nếu ai đó đổi thuật toán mà không có kế hoạch rolling restart cả hai app.
  it.each([
    ['user-1', 2, 0],
    ['user-1', 16, 4],
    ['user-2', 2, 1],
    ['user-2', 16, 13],
    ['00000000-0000-4000-8000-000000000001', 4, 2],
    ['7b0f1c2e-5d3a-4c8e-9f10-2a6b7c8d9e01', 16, 2],
  ])('known vector %s / %i shard → %i', (userId, shardCount, expected) => {
    expect(realtimeShardIndex(userId, shardCount)).toBe(expected);
  });

  it('cùng userId luôn cùng shard, kết quả nằm trong [0, shardCount)', () => {
    for (const shardCount of [2, 3, 16, 64]) {
      const first = realtimeShardIndex('7b0f1c2e', shardCount);
      expect(first).toBe(realtimeShardIndex('7b0f1c2e', shardCount));
      expect(first).toBeGreaterThanOrEqual(0);
      expect(first).toBeLessThan(shardCount);
    }
  });

  it('phân bố đều: lệch tối đa 10% so với trung bình trên 16 shard', () => {
    const shardCount = 16;
    const total = 64_000;
    const buckets = new Array<number>(shardCount).fill(0);
    for (let index = 0; index < total; index += 1) {
      const userId = `00000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`;
      buckets[realtimeShardIndex(userId, shardCount)] += 1;
    }
    const mean = total / shardCount;
    expect(Math.min(...buckets)).toBeGreaterThan(mean * 0.9);
    expect(Math.max(...buckets)).toBeLessThan(mean * 1.1);
  });
});

describe('parseRealtimeRedisUrls', () => {
  it('không đặt hoặc rỗng → đúng một shard là Redis mặc định', () => {
    expect(parseRealtimeRedisUrls(undefined, 'redis://default:6379')).toEqual([
      'redis://default:6379',
    ]);
    expect(parseRealtimeRedisUrls('  , ', 'redis://default:6379')).toEqual([
      'redis://default:6379',
    ]);
  });

  it('giữ thứ tự khai báo (thứ tự quyết định chỗ của user) và bỏ khoảng trắng', () => {
    expect(
      parseRealtimeRedisUrls(
        ' redis://a:6379 ,redis://b:6379,, redis://c:6379',
        'redis://default:6379',
      ),
    ).toEqual(['redis://a:6379', 'redis://b:6379', 'redis://c:6379']);
  });
});
