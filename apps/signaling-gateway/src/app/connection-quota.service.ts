import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

import { signalingRedisClientOptions } from './redis-client-options';

import type { SignalingEnv } from '../config/env.validation';

const QUOTA_KEY_PREFIX = 'signaling:connection-quota:';

const ACQUIRE_SCRIPT = `
local now = redis.call('TIME')
local now_ms = (now[1] * 1000) + math.floor(now[2] / 1000)
local expires_at = now_ms + tonumber(ARGV[2])
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now_ms)
if redis.call('ZSCORE', KEYS[1], ARGV[1]) then
  redis.call('ZADD', KEYS[1], expires_at, ARGV[1])
  redis.call('PEXPIRE', KEYS[1], ARGV[2])
  return 1
end
if redis.call('ZCARD', KEYS[1]) >= tonumber(ARGV[3]) then
  return 0
end
redis.call('ZADD', KEYS[1], expires_at, ARGV[1])
redis.call('PEXPIRE', KEYS[1], ARGV[2])
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
return 1
`;

const RELEASE_SCRIPT = `
local removed = redis.call('ZREM', KEYS[1], ARGV[1])
if redis.call('ZCARD', KEYS[1]) == 0 then
  redis.call('DEL', KEYS[1])
end
return removed
`;

@Injectable()
export class ConnectionQuotaService
  implements OnModuleInit, OnApplicationShutdown
{
  private readonly logger = new Logger(ConnectionQuotaService.name);
  private readonly redis: Redis;
  private readonly unavailableListeners = new Set<() => void>();
  readonly leaseMs: number;
  readonly maxConnections: number;

  constructor(config: ConfigService<SignalingEnv, true>) {
    this.leaseMs = config.getOrThrow('WS_CONNECTION_LEASE_MS', {
      infer: true,
    });
    this.maxConnections = config.getOrThrow('WS_MAX_CONNECTIONS_PER_USER', {
      infer: true,
    });
    this.redis = new Redis(
      config.getOrThrow('REDIS_URL', { infer: true }),
      signalingRedisClientOptions(),
    );
    // This command client is deliberately separate from subscriber-mode connections.
    // Commands still reject during an outage (the gateway fails closed), while the listener
    // prevents a transient ioredis EventEmitter error from becoming unhandled.
    this.redis.on('error', (error) => {
      this.logger.warn(`Quota Redis lỗi: ${String(error)}`);
    });
    this.redis.on('close', () => this.notifyUnavailable());
    this.redis.on('end', () => this.notifyUnavailable());
  }

  isReady(): boolean {
    return this.redis.status === 'ready';
  }

  onUnavailable(listener: () => void): () => void {
    this.unavailableListeners.add(listener);
    return () => this.unavailableListeners.delete(listener);
  }

  async onModuleInit(): Promise<void> {
    if (this.isReady()) return;
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        this.redis.off('ready', onReady);
        this.redis.off('error', onError);
      };
      const onReady = () => {
        cleanup();
        resolve();
      };
      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };
      this.redis.once('ready', onReady);
      this.redis.once('error', onError);
    });
  }

  async acquire(userId: string, leaseId: string): Promise<boolean> {
    const result = await this.redis.eval(
      ACQUIRE_SCRIPT,
      1,
      this.key(userId),
      leaseId,
      this.leaseMs,
      this.maxConnections,
    );
    return result === 1;
  }

  async refresh(userId: string, leaseId: string): Promise<boolean> {
    const result = await this.redis.eval(
      REFRESH_SCRIPT,
      1,
      this.key(userId),
      leaseId,
      this.leaseMs,
    );
    return result === 1;
  }

  async release(userId: string, leaseId: string): Promise<void> {
    await this.redis.eval(RELEASE_SCRIPT, 1, this.key(userId), leaseId);
  }

  async onApplicationShutdown(): Promise<void> {
    try {
      await this.redis.quit();
    } catch (error) {
      this.logger.warn(`Quota Redis quit thất bại: ${String(error)}`);
      this.redis.disconnect();
    }
  }

  private key(userId: string): string {
    return `${QUOTA_KEY_PREFIX}${userId}`;
  }

  private notifyUnavailable(): void {
    for (const listener of this.unavailableListeners) listener();
  }
}
