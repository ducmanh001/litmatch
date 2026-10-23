import * as Joi from 'joi';

/** Chặn cấu hình nhầm: mỗi shard là một client lệnh + một subscriber trên MỖI pod gateway. */
export const REALTIME_REDIS_SHARDS_MAX = 64;

const REDIS_URL_SCHEMA = Joi.string().uri({ scheme: ['redis', 'rediss'] });

/**
 * `REALTIME_REDIS_URLS` — danh sách redis(s) URL ngăn cách bằng dấu phẩy, mỗi URL là một shard
 * của mặt phẳng realtime (pub/sub + presence/quota). Rỗng = một shard là `REDIS_URL`.
 *
 * core-api và signaling-gateway PHẢI nhận cùng danh sách theo cùng thứ tự: thứ tự quyết định
 * user nằm ở shard nào (`realtimeShardIndex` trong `@litmatch/common-dtos`). URL trùng nhau bị
 * từ chối vì hai shard cùng trỏ một Redis không thêm được trần nào mà còn che lỗi cấu hình.
 */
export function realtimeRedisUrlsSchema(
  maxShards: number = REALTIME_REDIS_SHARDS_MAX,
): Joi.StringSchema {
  return Joi.string()
    .allow('')
    .default('')
    .custom((value: string) => {
      const urls = value
        .split(',')
        .map((url) => url.trim())
        .filter((url) => url.length > 0);
      if (urls.length > maxShards) {
        throw new Error(`tối đa ${maxShards} shard, nhận ${urls.length}`);
      }
      for (const url of urls) {
        if (REDIS_URL_SCHEMA.validate(url).error) {
          throw new Error(`không phải redis:// hoặc rediss:// URL hợp lệ`);
        }
      }
      if (new Set(urls).size !== urls.length) {
        throw new Error('có URL shard bị trùng');
      }
      return value;
    });
}
