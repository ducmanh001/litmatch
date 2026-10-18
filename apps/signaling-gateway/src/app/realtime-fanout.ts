import {
  REALTIME_USER_CHANNEL_PATTERN,
  realtimeShardIndex,
  realtimeUserChannel,
} from '@litmatch/common-dtos';
import Redis from 'ioredis';

import { signalingRedisClientOptions } from './redis-client-options';

/**
 * - `user` (mặc định): pod chỉ SUBSCRIBE channel của user đang có socket TRÊN POD NÀY. Mỗi event
 *   Redis chỉ giao cho pod giữ user → tổng công việc tỉ lệ với số event, không nhân với số pod.
 * - `pattern`: PSUBSCRIBE `realtime:user:*` như trước — mọi pod nhận mọi event (O(event × pod)).
 *   Giữ làm đường lùi khi cần quay về hành vi cũ mà không đổi code.
 */
export type FanoutMode = 'user' | 'pattern';

const SUBSCRIBE_CHUNK = 1_000;
const RECONCILE_RETRY_MIN_MS = 1_000;
const RECONCILE_RETRY_JITTER_MS = 2_000;

interface UserSubscription {
  /** Số socket của user này trên pod. */
  count: number;
  /** Settle khi SUBSCRIBE đã được Redis xác nhận — socket thứ hai của user chờ cùng promise. */
  ready: Promise<void>;
}

interface FanoutShard {
  index: number;
  redis: Redis;
  users: Map<string, UserSubscription>;
  ready: boolean;
  dirty: boolean;
  reconciling: Promise<void> | undefined;
  retryTimer: NodeJS.Timeout | undefined;
}

export interface RealtimeFanoutOptions {
  /** Redis của từng shard, theo đúng thứ tự `REALTIME_REDIS_URLS` (thứ tự quyết định chỗ của user). */
  urls: readonly string[];
  mode: FanoutMode;
  /** Nhận (channel, payload thô) — chạy cho mọi message Redis giao cho pod. */
  onEvent(channel: string, raw: string): void;
  logger: { warn(message: string): void; error(message: string): void };
  onError?(error: unknown, context: string): void;
  /** Seam cho test; mặc định tạo ioredis subscriber-mode. */
  createClient?: (url: string) => Redis;
}

/**
 * Tầng subscribe Redis của gateway (docs/services/realtime-gateway.md § 5–6).
 *
 * `autoResubscribe` của ioredis bị tắt có chủ đích: khi reconnect, trạng thái mong muốn là
 * "các user đang có socket ở pod này" — chỉ `users` biết điều đó. Tự khôi phục từ `users` tránh
 * giữ subscription mồ côi của user đã rời trong lúc Redis mất kết nối.
 *
 * Ngữ nghĩa best-effort giữ nguyên: event publish trong lúc subscription chưa có hiệu lực bị mất
 * (client còn REST polling). Khác biệt duy nhất so với PSUBSCRIBE: handshake chỉ hoàn tất SAU khi
 * SUBSCRIBE đã được xác nhận, nên mọi event publish sau khi client thấy `connect` đều tới pod.
 */
export class RealtimeFanout {
  private readonly shards: FanoutShard[];
  private closing = false;

  constructor(private readonly options: RealtimeFanoutOptions) {
    const createClient =
      options.createClient ??
      ((url: string) =>
        new Redis(url, {
          ...signalingRedisClientOptions(),
          autoResubscribe: false,
        }));
    this.shards = options.urls.map((url, index) => {
      const shard: FanoutShard = {
        index,
        redis: createClient(url),
        users: new Map(),
        ready: false,
        dirty: false,
        reconciling: undefined,
        retryTimer: undefined,
      };
      this.attach(shard);
      return shard;
    });
  }

  get shardCount(): number {
    return this.shards.length;
  }

  /** Số user đang được subscribe riêng (luôn 0 ở chế độ `pattern`). */
  get subscribedUsers(): number {
    let total = 0;
    for (const shard of this.shards) total += shard.users.size;
    return total;
  }

  /** Mọi shard đã kết nối VÀ subscription mong muốn đã có hiệu lực. */
  isReady(): boolean {
    return this.shards.every((_shard, index) => this.isShardReady(index));
  }

  /** Shard `index` đã kết nối VÀ subscription mong muốn của nó đã có hiệu lực. */
  isShardReady(index: number): boolean {
    const shard = this.shards[index];
    return shard !== undefined && shard.ready && shard.redis.status === 'ready';
  }

  /**
   * Gọi trước khi báo `connect` cho client. Reject khi Redis không nhận SUBSCRIBE → caller từ chối
   * handshake. Mỗi lời gọi (kể cả lời gọi reject) tăng bộ đếm và caller PHẢI gọi `releaseUser`
   * đúng một lần tương ứng: giữ quyền sở hữu ở một nơi để transport đóng giữa chừng không dẫn tới
   * giảm đếm hai lần (làm mất subscription của socket khác cùng user).
   */
  async subscribeUser(userId: string): Promise<void> {
    if (this.options.mode !== 'user') return;
    const shard = this.shardFor(userId);
    let entry = shard.users.get(userId);
    if (entry) {
      entry.count += 1;
      // Promise cũ đã resolve từ trước một lần Redis mất kết nối: subscription thật có thể không
      // còn. SUBSCRIBE idempotent nên gửi lại — reject khi connection còn đứt (offline queue tắt),
      // và handshake fail closed đúng như socket đầu tiên.
      if (!shard.ready || shard.redis.status !== 'ready') {
        entry.ready = shard.redis
          .subscribe(realtimeUserChannel(userId))
          .then(() => undefined);
      }
    } else {
      entry = {
        count: 1,
        ready: shard.redis
          .subscribe(realtimeUserChannel(userId))
          .then(() => undefined),
      };
      shard.users.set(userId, entry);
    }
    await entry.ready;
  }

  /** Socket cuối cùng của user rời pod → bỏ subscribe để Redis không giao event cho pod nữa. */
  releaseUser(userId: string): void {
    if (this.options.mode !== 'user') return;
    this.release(this.shardFor(userId), userId);
  }

  /**
   * Bắt đầu tắt: ngừng khôi phục subscription và ngừng gửi UNSUBSCRIBE từng user. Gateway gọi
   * trước khi ngắt hàng chục nghìn socket — mỗi socket rời sẽ thành một lệnh UNSUBSCRIBE vô ích
   * ngay trước `close()`, vốn QUIT cả connection (Redis tự bỏ mọi subscription của nó).
   */
  beginClose(): void {
    this.closing = true;
  }

  async close(): Promise<void> {
    this.closing = true;
    await Promise.all(
      this.shards.map(async (shard) => {
        if (shard.retryTimer) clearTimeout(shard.retryTimer);
        shard.retryTimer = undefined;
        shard.ready = false;
        try {
          await shard.redis.quit();
        } catch {
          // `quit()` không gửi được khi Redis đang reconnect (offline queue đã tắt). Đóng cưỡng
          // bức để retry timer/socket không giữ process sống sau shutdown.
          shard.redis.disconnect();
        }
      }),
    );
  }

  private attach(shard: FanoutShard): void {
    const { redis } = shard;
    redis.on('ready', () => this.reconcile(shard));
    redis.on('close', () => {
      shard.ready = false;
    });
    redis.on('end', () => {
      shard.ready = false;
    });
    redis.on('error', (error: unknown) => {
      this.options.logger.warn(
        `Fanout Redis shard ${shard.index} lỗi: ${String(error)}`,
      );
    });
    if (this.options.mode === 'pattern') {
      redis.on('pmessage', (_pattern: string, channel: string, raw: string) =>
        this.options.onEvent(channel, raw),
      );
    } else {
      redis.on('message', (channel: string, raw: string) =>
        this.options.onEvent(channel, raw),
      );
    }
    if (redis.status === 'ready') this.reconcile(shard);
  }

  private release(shard: FanoutShard, userId: string): void {
    const entry = shard.users.get(userId);
    if (!entry) return;
    entry.count -= 1;
    if (entry.count > 0) return;
    shard.users.delete(userId);
    if (this.closing) return;
    // Best-effort: khi shard đang mất kết nối, subscription đã tự mất cùng connection.
    void shard.redis
      .unsubscribe(realtimeUserChannel(userId))
      .catch(() => undefined);
  }

  /** Đưa Redis về đúng trạng thái subscribe mong muốn sau mỗi lần connection sẵn sàng. */
  private reconcile(shard: FanoutShard): void {
    if (this.closing) return;
    shard.dirty = true;
    if (shard.reconciling) return;
    shard.reconciling = (async () => {
      while (shard.dirty && !this.closing) {
        shard.dirty = false;
        shard.ready = false;
        if (shard.retryTimer) clearTimeout(shard.retryTimer);
        shard.retryTimer = undefined;
        try {
          await this.applySubscriptions(shard);
          shard.ready = shard.redis.status === 'ready';
        } catch (error) {
          this.options.logger.error(
            `Khôi phục subscription fanout shard ${shard.index} thất bại: ${String(error)}`,
          );
          this.options.onError?.(error, 'signaling-redis-subscription');
          this.scheduleRetry(shard);
        }
      }
    })().finally(() => {
      shard.reconciling = undefined;
    });
  }

  private async applySubscriptions(shard: FanoutShard): Promise<void> {
    const { redis } = shard;
    if (this.options.mode === 'pattern') {
      await redis.psubscribe(REALTIME_USER_CHANNEL_PATTERN);
      return;
    }
    const sent: string[] = [];
    const userIds = [...shard.users.keys()];
    for (let offset = 0; offset < userIds.length; offset += SUBSCRIBE_CHUNK) {
      const chunk = userIds.slice(offset, offset + SUBSCRIBE_CHUNK);
      await redis.subscribe(...chunk.map(realtimeUserChannel));
      sent.push(...chunk);
    }
    // User đã rời trong lúc đang khôi phục: bỏ subscribe thừa thay vì để mồ côi tới lần reconnect sau.
    const stale = sent.filter((userId) => !shard.users.has(userId));
    if (stale.length > 0)
      await redis.unsubscribe(...stale.map(realtimeUserChannel));
  }

  private scheduleRetry(shard: FanoutShard): void {
    if (this.closing || shard.redis.status !== 'ready' || shard.retryTimer) {
      return;
    }
    shard.retryTimer = setTimeout(
      () => {
        shard.retryTimer = undefined;
        this.reconcile(shard);
      },
      RECONCILE_RETRY_MIN_MS + Math.random() * RECONCILE_RETRY_JITTER_MS,
    );
    shard.retryTimer.unref();
  }

  private shardFor(userId: string): FanoutShard {
    return this.shards[realtimeShardIndex(userId, this.shards.length)];
  }
}
