import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import Redis from 'ioredis';
import { DataSource } from 'typeorm';

import type { CoreApiEnv } from '../config/env.validation';

const PROBE_CACHE_MS = 1_000;
const PROBE_TIMEOUT_MS = 1_000;

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
  private inFlight: Promise<ReadinessResult> | undefined;
  private cached: { expiresAt: number; result: ReadinessResult } | undefined;
  private postgresProbe: Promise<'up' | 'down'> | undefined;

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

  check(): Promise<ReadinessResult> {
    if (this.cached && Date.now() < this.cached.expiresAt) {
      return Promise.resolve(this.cached.result);
    }
    if (this.inFlight) return this.inFlight;
    // Probes bypass shared request throttling; coalesce and cache locally instead.
    this.inFlight = this.probe()
      .then((result) => {
        this.cached = { result, expiresAt: Date.now() + PROBE_CACHE_MS };
        return result;
      })
      .finally(() => {
        this.inFlight = undefined;
      });
    return this.inFlight;
  }

  private async probe(): Promise<ReadinessResult> {
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
      // The HTTP deadline does not cancel SQL. Retain the raw query until it settles,
      // so repeated timed-out probes cannot fill the connection pool.
      this.postgresProbe ??= this.dataSource
        .query('SELECT 1')
        .then(
          () => 'up' as const,
          () => 'down' as const,
        )
        .finally(() => {
          this.postgresProbe = undefined;
        });
      return await this.withTimeout(this.postgresProbe, PROBE_TIMEOUT_MS);
    } catch {
      return 'down';
    }
  }

  private async checkRedis(): Promise<'up' | 'down'> {
    try {
      if (this.redis.status === 'wait') await this.redis.connect();
      await this.withTimeout(this.redis.ping(), PROBE_TIMEOUT_MS);
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
