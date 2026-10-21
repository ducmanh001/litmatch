import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  parseRealtimeRedisUrls,
  realtimePresenceKey,
  realtimeShardIndex,
} from '@litmatch/common-dtos';
import Redis from 'ioredis';
import { createHash } from 'node:crypto';

import { signalingRedisClientOptions } from './redis-client-options';

import type { SignalingEnv } from '../config/env.validation';

const QUOTA_KEY_PREFIX = 'signaling:connection-quota:';
/** Persistent on the shared adapter Redis: changing placement requires draining every gateway first. */
const TOPOLOGY_KEY = 'signaling:connection-quota-topology:v1';
const REGISTER_TOPOLOGY_SCRIPT = `
local current = redis.call('GET', KEYS[1])
if not current then
  redis.call('SET', KEYS[1], ARGV[1])
  return 1
end
return current == ARGV[1] and 1 or 0
`;
/** Số lease refresh/release trong một pipeline — đủ lớn để gộp round trip, đủ nhỏ để dưới commandTimeout. */
const PIPELINE_CHUNK = 500;

const ACQUIRE_SCRIPT = `
local now = redis.call('TIME')
local now_ms = (now[1] * 1000) + math.floor(now[2] / 1000)
local expires_at = now_ms + tonumber(ARGV[2])
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now_ms)
if redis.call('ZSCORE', KEYS[1], ARGV[1]) then
  redis.call('ZADD', KEYS[1], expires_at, ARGV[1])
  redis.call('PEXPIRE', KEYS[1], ARGV[2])
  redis.call('ZADD', KEYS[2], expires_at, ARGV[1])
  redis.call('PEXPIRE', KEYS[2], ARGV[2])
  return 1
end
if redis.call('ZCARD', KEYS[1]) >= tonumber(ARGV[3]) then
  return 0
end
redis.call('ZADD', KEYS[1], expires_at, ARGV[1])
redis.call('PEXPIRE', KEYS[1], ARGV[2])
redis.call('ZADD', KEYS[2], expires_at, ARGV[1])
redis.call('PEXPIRE', KEYS[2], ARGV[2])
return 1
`;

const REFRESH_SCRIPT = `
local now = redis.call('TIME')
local now_ms = (now[1] * 1000) + math.floor(now[2] / 1000)
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now_ms)
if not redis.call('ZSCORE', KEYS[1], ARGV[1]) then
  return 0
end
redis.call('ZADD', KEYS[1], now_ms + tonumber(ARGV[2]), ARGV[1])
redis.call('PEXPIRE', KEYS[1], ARGV[2])
redis.call('ZADD', KEYS[2], now_ms + tonumber(ARGV[2]), ARGV[1])
redis.call('PEXPIRE', KEYS[2], ARGV[2])
return 1
`;

const RELEASE_SCRIPT = `
local removed = redis.call('ZREM', KEYS[1], ARGV[1])
if redis.call('ZCARD', KEYS[1]) == 0 then
  redis.call('DEL', KEYS[1])
end
redis.call('ZREM', KEYS[2], ARGV[1])
if redis.call('ZCARD', KEYS[2]) == 0 then
  redis.call('DEL', KEYS[2])
end
return removed
`;

type ScriptArg = string | number;
/** Script đăng ký bằng `defineCommand` → gọi EVALSHA (40 byte) thay vì gửi lại cả thân script. */
type QuotaRedis = Redis & {
  quotaAcquire(...args: ScriptArg[]): Promise<number>;
  quotaRefresh(...args: ScriptArg[]): Promise<number>;
  quotaRelease(...args: ScriptArg[]): Promise<number>;
};
type QuotaPipeline = {
  quotaAcquire(...args: ScriptArg[]): unknown;
  quotaRefresh(...args: ScriptArg[]): unknown;
  quotaRelease(...args: ScriptArg[]): unknown;
  exec(): Promise<Array<[Error | null, unknown]> | null>;
};

export interface LeaseRef {
  userId: string;
  leaseId: string;
}

/**
 * - `ok`: lease còn và đã được gia hạn.
 * - `lost`: Redis trả lời lease không còn (hết hạn/bị dọn) → socket không còn quyền giữ slot.
 * - `error`: không biết (Redis lỗi/timeout) → gateway giữ socket tới hạn lease cục bộ rồi mới ngắt.
 */
export type RefreshOutcome = 'ok' | 'lost' | 'error';

/**
 * Quota socket/user + presence, lease trên Redis. Mọi key của một user nằm cùng một shard
 * (`realtimeShardIndex`) nên script hai-key vẫn atomic và không lệnh nào đi xuyên shard.
 */
@Injectable()
export class ConnectionQuotaService
  implements OnModuleInit, OnApplicationShutdown
{
  private readonly logger = new Logger(ConnectionQuotaService.name);
  private readonly clients: QuotaRedis[];
  private readonly topologyClient: Redis;
  private readonly topologyFingerprint: string;
  readonly leaseMs: number;
  readonly maxConnections: number;

  constructor(config: ConfigService<SignalingEnv, true>) {
    this.leaseMs = config.getOrThrow('WS_CONNECTION_LEASE_MS', {
      infer: true,
    });
    this.maxConnections = config.getOrThrow('WS_MAX_CONNECTIONS_PER_USER', {
      infer: true,
    });
    const coordinatorUrl = config.getOrThrow('REDIS_URL', { infer: true });
    const urls = parseRealtimeRedisUrls(
      config.get('REALTIME_REDIS_URLS', { infer: true }),
      coordinatorUrl,
    );
    this.clients = urls.map((url, shard) => this.createClient(url, shard));
    this.topologyClient =
      this.clients[urls.indexOf(coordinatorUrl)] ??
      new Redis(coordinatorUrl, signalingRedisClientOptions());
    if (!this.clients.includes(this.topologyClient as QuotaRedis)) {
      this.topologyClient.on('error', (error) => {
        this.logger.warn(
          `Quota topology coordinator unavailable: ${String(error)}`,
        );
      });
    }
    // Credentials may rotate without moving data; order, endpoint and database determine placement.
    const placements = urls.map((value) => {
      const url = new URL(value);
      // ioredis accepts query overrides such as db, host and keyPrefix.
      // Conservatively include every non-credential option so a remap cannot share a fingerprint.
      url.searchParams.delete('username');
      url.searchParams.delete('password');
      url.searchParams.sort();
      return [
        url.protocol,
        url.hostname,
        url.port || '6379',
        url.pathname && url.pathname !== '/' ? url.pathname : '/0',
        url.search,
      ];
    });
    this.topologyFingerprint = createHash('sha256')
      .update(JSON.stringify(placements))
      .digest('hex');
  }

  get shardCount(): number {
    return this.clients.length;
  }

  isReady(): boolean {
    return this.clients.every((_client, index) => this.isShardReady(index));
  }

  /** Shard `index` đang nhận lệnh được. */
  isShardReady(index: number): boolean {
    return this.clients[index]?.status === 'ready';
  }

  /**
   * Một shard chết lúc khởi động không được chặn cả pod (rolling restart/scale-up đúng lúc một shard
   * failover sẽ crash-loop): user của shard đó fail closed lúc handshake, user các shard còn lại
   * vẫn phục vụ được. Chỉ khi KHÔNG shard nào lên được mới là lỗi khởi động (như trước khi có shard).
   */
  async onModuleInit(): Promise<void> {
    try {
      await Promise.all([
        this.registerTopology(),
        Promise.any(this.clients.map((client) => this.waitReady(client))),
      ]);
    } catch (error) {
      throw error instanceof AggregateError ? error.errors[0] : error;
    }
  }

  private async registerTopology(): Promise<void> {
    await this.waitReady(this.topologyClient);
    const registered = await this.topologyClient.eval(
      REGISTER_TOPOLOGY_SCRIPT,
      1,
      TOPOLOGY_KEY,
      this.topologyFingerprint,
    );
    if (registered !== 1) {
      // A rolling modulo remap would create two independent quotas for the same user.
      throw new Error(
        'Realtime quota topology changed: drain all gateways, wait for connection leases to expire, then perform the documented topology cutover',
      );
    }
  }

  async acquire(userId: string, leaseId: string): Promise<boolean> {
    const result = await this.clientFor(userId).quotaAcquire(
      this.key(userId),
      realtimePresenceKey(userId),
      leaseId,
      this.leaseMs,
      this.maxConnections,
    );
    return result === 1;
  }

  /**
   * Gia hạn nhiều lease bằng pipeline theo shard. Không bao giờ throw: lỗi Redis được báo bằng
   * `error` để gateway quyết định (giữ tới hạn lease cục bộ) thay vì ngắt cả đàn socket cùng lúc.
   */
  async refreshMany(leases: readonly LeaseRef[]): Promise<RefreshOutcome[]> {
    const results = await this.pipelineByShard(leases, (pipeline, lease) => {
      pipeline.quotaRefresh(
        this.key(lease.userId),
        realtimePresenceKey(lease.userId),
        lease.leaseId,
        this.leaseMs,
      );
    });
    return results.map((result): RefreshOutcome => {
      if (result === undefined || result[0]) return 'error';
      return result[1] === 1 ? 'ok' : 'lost';
    });
  }

  /**
   * Cấp lại lease mà Redis báo `lost`. `lost` không chỉ là lease hết hạn thật: Redis restart hoặc
   * failover mất dữ liệu cũng làm MỌI lease biến mất cùng lúc, và ngắt hết socket trong trường hợp đó
   * là biến sự cố Redis thành reconnect storm. Script acquire idempotent theo leaseId và kiểm trần
   * socket/user nên chỉ cấp lại khi slot còn trống; hết slot → vẫn `lost`. Không bao giờ throw.
   */
  async reacquireMany(leases: readonly LeaseRef[]): Promise<RefreshOutcome[]> {
    const results = await this.pipelineByShard(leases, (pipeline, lease) => {
      pipeline.quotaAcquire(
        this.key(lease.userId),
        realtimePresenceKey(lease.userId),
        lease.leaseId,
        this.leaseMs,
        this.maxConnections,
      );
    });
    return results.map((result): RefreshOutcome => {
      if (result === undefined || result[0]) return 'error';
      return result[1] === 1 ? 'ok' : 'lost';
    });
  }

  async release(userId: string, leaseId: string): Promise<void> {
    await this.clientFor(userId).quotaRelease(
      this.key(userId),
      realtimePresenceKey(userId),
      leaseId,
    );
  }

  /** Best-effort: lease có TTL nên release lỗi chỉ làm slot giữ thêm tới khi hết hạn. */
  async releaseMany(leases: readonly LeaseRef[]): Promise<void> {
    await this.pipelineByShard(leases, (pipeline, lease) => {
      pipeline.quotaRelease(
        this.key(lease.userId),
        realtimePresenceKey(lease.userId),
        lease.leaseId,
      );
    });
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.all(
      [...new Set<Redis>([...this.clients, this.topologyClient])].map(
        async (client) => {
          try {
            await client.quit();
          } catch (error) {
            this.logger.warn(`Quota Redis quit thất bại: ${String(error)}`);
            client.disconnect();
          }
        },
      ),
    );
  }

  private createClient(url: string, shard: number): QuotaRedis {
    const client = new Redis(url, signalingRedisClientOptions()) as QuotaRedis;
    client.defineCommand('quotaAcquire', {
      numberOfKeys: 2,
      lua: ACQUIRE_SCRIPT,
    });
    client.defineCommand('quotaRefresh', {
      numberOfKeys: 2,
      lua: REFRESH_SCRIPT,
    });
    client.defineCommand('quotaRelease', {
      numberOfKeys: 2,
      lua: RELEASE_SCRIPT,
    });
    // Client lệnh tách riêng khỏi subscriber-mode. Lệnh vẫn reject khi Redis mất kết nối (handshake
    // mới fail closed), còn listener này chặn lỗi ioredis bất đồng bộ thành unhandled error.
    // Socket đang sống KHÔNG bị ngắt theo sự kiện close/end: ngắt cả đàn khi Redis chớp một giây
    // rồi cả đàn reconnect vào đúng Redis đang hồi phục là vòng khuếch đại, nên gateway chỉ ngắt
    // từng socket khi lease cục bộ của nó hết hạn mà không gia hạn được (lease-refresher).
    client.on('error', (error) => {
      this.logger.warn(`Quota Redis shard ${shard} lỗi: ${String(error)}`);
    });
    return client;
  }

  private waitReady(client: Redis): Promise<void> {
    if (client.status === 'ready') return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        client.off('ready', onReady);
        client.off('error', onError);
      };
      const onReady = () => {
        cleanup();
        resolve();
      };
      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };
      client.once('ready', onReady);
      client.once('error', onError);
    });
  }

  /** Chạy một pipeline cho mỗi (shard, chunk); trả kết quả theo đúng thứ tự `leases`. */
  private async pipelineByShard(
    leases: readonly LeaseRef[],
    enqueue: (pipeline: QuotaPipeline, lease: LeaseRef) => void,
  ): Promise<Array<[Error | null, unknown] | undefined>> {
    // `fill` để mảng không có "lỗ" — `Array.prototype.map` bỏ qua ô trống nên lease không nhận được
    // kết quả sẽ không bao giờ được ánh xạ thành `error`.
    const results = new Array<[Error | null, unknown] | undefined>(
      leases.length,
    ).fill(undefined);
    const indexesByShard = new Map<number, number[]>();
    leases.forEach((lease, index) => {
      const shard = realtimeShardIndex(lease.userId, this.clients.length);
      const indexes = indexesByShard.get(shard);
      if (indexes) indexes.push(index);
      else indexesByShard.set(shard, [index]);
    });
    await Promise.all(
      [...indexesByShard].map(async ([shard, indexes]) => {
        for (
          let offset = 0;
          offset < indexes.length;
          offset += PIPELINE_CHUNK
        ) {
          const chunk = indexes.slice(offset, offset + PIPELINE_CHUNK);
          try {
            const pipeline = this.clients[
              shard
            ].pipeline() as unknown as QuotaPipeline;
            for (const index of chunk) enqueue(pipeline, leases[index]);
            const executed = await pipeline.exec();
            executed?.forEach((entry, position) => {
              results[chunk[position]] = entry;
            });
          } catch {
            // Giữ `undefined` → caller coi là lỗi (refresh) hoặc bỏ qua (release, có TTL).
          }
        }
      }),
    );
    return results;
  }

  private clientFor(userId: string): QuotaRedis {
    return this.clients[realtimeShardIndex(userId, this.clients.length)];
  }

  private key(userId: string): string {
    return `${QUOTA_KEY_PREFIX}${userId}`;
  }
}
