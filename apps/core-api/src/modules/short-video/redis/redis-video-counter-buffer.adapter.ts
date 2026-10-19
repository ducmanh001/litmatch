import { closeCoreRedisClient } from '../../../common/redis/core-redis-client';
import { VideoCounterBufferPort } from '../ports/video-counter-buffer.port';

import type Redis from 'ioredis';
import type {
  VideoCounterDeltas,
  VideoCounterField,
} from '../ports/video-counter-buffer.port';

const FIELD_CODE: Record<VideoCounterField, string> = {
  view: 'v',
  like: 'l',
  comment: 'c',
};

/**
 * Lấy `limit` video khỏi tập "có delta" và xoá hash delta của chúng NGUYÊN TỬ (Lua), trả
 * `[id, views, likes, comments, ...]`. `SPOP` trong script an toàn vì Redis ≥ 5 nhân bản effect của script.
 */
const DRAIN_LUA = `
local ids = redis.call('SPOP', KEYS[1], tonumber(ARGV[1]))
local out = {}
for _, id in ipairs(ids) do
  local key = ARGV[2] .. id
  local h = redis.call('HMGET', key, 'v', 'l', 'c')
  redis.call('DEL', key)
  out[#out + 1] = id
  out[#out + 1] = h[1] or '0'
  out[#out + 1] = h[2] or '0'
  out[#out + 1] = h[3] or '0'
end
return out
`;

/**
 * Counter buffer trên Redis lõi: mỗi video một hash `{prefix}{id}` (`v`/`l`/`c`) + tập `{prefix}dirty` các video có
 * delta. `HINCRBY` + `SADD` đi chung một pipeline; lỗi bất kỳ được ném lên để caller cộng thẳng vào DB.
 * Một Redis đơn (cùng giả định với rate limiter): script chạm hai nhóm khoá khác nhau.
 */
export class RedisVideoCounterBufferAdapter extends VideoCounterBufferPort {
  readonly enabled = true;

  constructor(
    private readonly redis: Redis,
    /** Tiền tố khoá — test truyền tiền tố riêng để cô lập. */
    private readonly prefix = 'video:counter:',
  ) {
    super();
  }

  async add(
    videoId: string,
    field: VideoCounterField,
    delta: number,
  ): Promise<void> {
    if (!Number.isInteger(delta) || delta === 0) {
      throw new Error('Video counter delta must be a non-zero integer');
    }
    const results = await this.redis
      .pipeline()
      .hincrby(`${this.prefix}${videoId}`, FIELD_CODE[field], delta)
      .sadd(`${this.prefix}dirty`, videoId)
      .exec();
    for (const [error] of results ?? []) {
      if (error) throw error;
    }
  }

  async drain(limit: number): Promise<VideoCounterDeltas[]> {
    const raw = (await this.redis.eval(
      DRAIN_LUA,
      1,
      `${this.prefix}dirty`,
      String(limit),
      this.prefix,
    )) as string[];
    const items: VideoCounterDeltas[] = [];
    for (let i = 0; i + 3 < raw.length; i += 4) {
      items.push({
        videoId: raw[i] as string,
        views: Number(raw[i + 1]),
        likes: Number(raw[i + 2]),
        comments: Number(raw[i + 3]),
      });
    }
    return items;
  }

  async restore(items: readonly VideoCounterDeltas[]): Promise<void> {
    for (const item of items) {
      if (item.views !== 0) await this.add(item.videoId, 'view', item.views);
      if (item.likes !== 0) await this.add(item.videoId, 'like', item.likes);
      if (item.comments !== 0) {
        await this.add(item.videoId, 'comment', item.comments);
      }
    }
  }

  async close(): Promise<void> {
    await closeCoreRedisClient(this.redis);
  }
}

/** Bộ đệm tắt (mặc định): service cộng thẳng vào DB trong transaction như trước. */
export class DisabledVideoCounterBuffer extends VideoCounterBufferPort {
  readonly enabled = false;

  add(): Promise<void> {
    return Promise.reject(new Error('Video counter buffer is disabled'));
  }

  drain(): Promise<VideoCounterDeltas[]> {
    return Promise.resolve([]);
  }

  restore(): Promise<void> {
    return Promise.resolve();
  }
}
