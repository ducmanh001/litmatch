import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import Redis from 'ioredis';
import { DataSource } from 'typeorm';

import type { CoreApiEnv } from '../config/env.validation';

export interface ReadinessResult {
  status: 'ok' | 'unavailable';
  checks: {
    postgres: 'up' | 'down';
    redis: 'up' | 'down';
  };
}

@Injectable()
export class ReadinessService implements OnApplicationShutdown {
  private readonly redis: Redis;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    config: ConfigService<CoreApiEnv, true>,
  ) {
    this.redis = new Redis(config.getOrThrow('REDIS_URL', { infer: true }), {
      lazyConnect: true,
      connectTimeout: 1_000,
      commandTimeout: 1_000,
      maxRetriesPerRequest: 0,
      enableOfflineQueue: false,
    });
    // A failed probe is represented in the HTTP response, not emitted as an unhandled event.
    this.redis.on('error', () => undefined);
  }

  async check(): Promise<ReadinessResult> {
    const [postgres, redis] = await Promise.all([
      this.checkPostgres(),
      this.checkRedis(),
    ]);
    const ready = postgres === 'up' && redis === 'up';

    return {
      status: ready ? 'ok' : 'unavailable',
      checks: { postgres, redis },
    };
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.redis.status !== 'end') {
      this.redis.disconnect(false);
    }
  }

  private async checkPostgres(): Promise<'up' | 'down'> {
    try {
      await this.withTimeout(this.dataSource.query('SELECT 1'), 1_000);
      return 'up';
    } catch {
      return 'down';
    }
  }

  private async checkRedis(): Promise<'up' | 'down'> {
    try {
      if (this.redis.status === 'wait') await this.redis.connect();
      await this.withTimeout(this.redis.ping(), 1_000);
      return 'up';
    } catch {
      return 'down';
    }
  }

  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
  ): Promise<T> {
    let timeout: NodeJS.Timeout | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timeout = setTimeout(
        () => reject(new Error('readiness timeout')),
        timeoutMs,
      );
      timeout.unref();
    });

    try {
      return await Promise.race([promise, deadline]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
}
