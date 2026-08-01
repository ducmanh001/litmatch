import type { Logger } from '@nestjs/common';
import type { SchedulerRegistry } from '@nestjs/schedule';
import type { DataSource, QueryRunner } from 'typeorm';

import { isRuntimeActive } from '../runtime/runtime-activity';

const CLUSTER_FOLLOWER_RETRY_MIN_MS = 5_000;

interface ClusterSingletonOptions {
  /**
   * PostgreSQL advisory xact lock keeps exactly one replica doing expensive work. The lock is
   * released automatically when the transaction/connection ends, including process crashes.
   */
  dataSource: DataSource;
  followerRetryMs?: number;
}

/**
 * Quản lý lifecycle và chống overlap cho một interval trong một process.
 * Correctness giữa nhiều process vẫn phải do transaction, lock hoặc idempotency của domain giữ.
 */
export class ManagedInterval {
  private running = false;
  private scheduledRunInFlight = false;
  private clusterRetryAfter = 0;
  private registration:
    { scheduler: SchedulerRegistry; jobName: string } | undefined;

  start(
    scheduler: SchedulerRegistry,
    options: {
      jobName: string;
      intervalMs: number;
      task: () => Promise<unknown>;
      logger: Pick<Logger, 'error'>;
      errorMessage: string;
      /** Skip this periodic backstop while the alpha process is idle. */
      skipWhenIdle?: boolean;
      clusterSingleton?: ClusterSingletonOptions;
    },
  ): void {
    const interval = setInterval(
      () =>
        void this.runScheduled(options).catch((error: unknown) =>
          options.logger.error({ err: `${error}` }, options.errorMessage),
        ),
      options.intervalMs,
    );
    scheduler.addInterval(options.jobName, interval);
    this.registration = { scheduler, jobName: options.jobName };
  }

  stop(): void {
    if (this.registration === undefined) return;
    const { scheduler, jobName } = this.registration;
    if (scheduler.doesExist('interval', jobName)) {
      scheduler.deleteInterval(jobName);
    }
    this.registration = undefined;
    this.clusterRetryAfter = 0;
  }

  async runExclusive<T>(task: () => Promise<T>, busyResult: T): Promise<T> {
    if (this.running) return busyResult;
    this.running = true;
    try {
      return await task();
    } finally {
      this.running = false;
    }
  }

  private async runScheduled(options: {
    jobName: string;
    intervalMs: number;
    task: () => Promise<unknown>;
    clusterSingleton?: ClusterSingletonOptions;
    skipWhenIdle?: boolean;
  }): Promise<void> {
    // setInterval does not await async callbacks. Keep slow ticks from piling up in one process.
    if (this.scheduledRunInFlight) return;
    if (options.skipWhenIdle && !isRuntimeActive()) return;
    if (
      options.clusterSingleton !== undefined &&
      Date.now() < this.clusterRetryAfter
    ) {
      return;
    }

    this.scheduledRunInFlight = true;
    try {
      const clusterSingleton = options.clusterSingleton;
      if (clusterSingleton === undefined) {
        await options.task();
        return;
      }
      await this.runClusterSingleton({
        ...options,
        clusterSingleton,
      });
    } finally {
      this.scheduledRunInFlight = false;
    }
  }

  private async runClusterSingleton(options: {
    jobName: string;
    intervalMs: number;
    task: () => Promise<unknown>;
    clusterSingleton: ClusterSingletonOptions;
  }): Promise<void> {
    const retryMs =
      options.clusterSingleton.followerRetryMs ??
      Math.max(options.intervalMs, CLUSTER_FOLLOWER_RETRY_MIN_MS);
    let runner: QueryRunner | undefined;

    try {
      runner = options.clusterSingleton.dataSource.createQueryRunner();
      await runner.connect();
      await runner.startTransaction();
      const rows = (await runner.query(
        `SELECT pg_try_advisory_xact_lock(
                  hashtextextended($1, 0)
                ) AS acquired`,
        [`litmatch:cluster-job:${options.jobName}`],
      )) as Array<{ acquired: boolean }>;

      if (rows[0]?.acquired !== true) {
        this.clusterRetryAfter = Date.now() + retryMs;
        await runner.rollbackTransaction();
        return;
      }

      this.clusterRetryAfter = 0;
      await options.task();
      await runner.commitTransaction();
    } catch (error) {
      if (runner?.isTransactionActive) {
        await runner.rollbackTransaction().catch(() => undefined);
      }
      // A broken DB should not make every replica retry a cluster claim on every short tick.
      this.clusterRetryAfter = Date.now() + retryMs;
      throw error;
    } finally {
      await runner?.release().catch(() => undefined);
    }
  }
}
