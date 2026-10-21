import type { Logger } from '@nestjs/common';
import type { SchedulerRegistry } from '@nestjs/schedule';
import type { DataSource, QueryRunner } from 'typeorm';

import type { ConcurrencyBudget } from './concurrency-budget';
import { acquireBackgroundDatabaseAdmission } from './background-database-admission';
import {
  isRuntimeActive,
  recordRuntimeBackgroundSkip,
} from '../runtime/runtime-activity';

const CLUSTER_FOLLOWER_RETRY_MIN_MS = 5_000;

interface ClusterSingletonOptions {
  /**
   * PostgreSQL advisory xact lock keeps exactly one replica doing expensive work. The lock is
   * released automatically when the transaction/connection ends, including process crashes.
   */
  dataSource: DataSource;
  followerRetryMs?: number;
  /** Reserved claim + task connections for the sequential calling timer only. */
  priority?: 'critical';
  /**
   * Ngân sách đồng thời dùng chung giữa các job nền của process: lấy TRƯỚC khi mở query runner (vì runner giữ một kết nối
   * pool suốt tick). Hết ngân sách thì bỏ tick, không chờ.
   */
  budget?: ConcurrencyBudget;
}

/**
 * Quản lý lifecycle và chống overlap cho một interval trong một process.
 * Correctness giữa nhiều process vẫn phải do transaction, lock hoặc idempotency của domain giữ.
 */
export class ManagedInterval {
  private running = false;
  private scheduledRunInFlight = false;
  private clusterRetryAfter = 0;
  private generation = 0;
  private cancelAdmission: (() => void) | undefined;
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
      /** Pool admission without a cluster lock; the task owns distributed claims. */
      databaseAdmission?: ClusterSingletonOptions;
    },
  ): void {
    const generation = ++this.generation;
    const interval = setInterval(
      () =>
        void this.runScheduled(options, generation).catch((error: unknown) =>
          options.logger.error({ err: `${error}` }, options.errorMessage),
        ),
      options.intervalMs,
    );
    scheduler.addInterval(options.jobName, interval);
    this.registration = { scheduler, jobName: options.jobName };
  }

  stop(): void {
    this.generation += 1;
    this.cancelAdmission?.();
    this.cancelAdmission = undefined;
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

  private async runScheduled(
    options: {
      jobName: string;
      intervalMs: number;
      task: () => Promise<unknown>;
      clusterSingleton?: ClusterSingletonOptions;
      databaseAdmission?: ClusterSingletonOptions;
      skipWhenIdle?: boolean;
    },
    generation: number,
  ): Promise<void> {
    // setInterval does not await async callbacks. Keep slow ticks from piling up in one process.
    if (this.scheduledRunInFlight || generation !== this.generation) return;
    if (options.skipWhenIdle && !isRuntimeActive()) {
      recordRuntimeBackgroundSkip(options.jobName);
      return;
    }
    if (
      options.clusterSingleton !== undefined &&
      Date.now() < this.clusterRetryAfter
    ) {
      return;
    }

    this.scheduledRunInFlight = true;
    try {
      const clusterSingleton = options.clusterSingleton;
      const databaseAdmission = clusterSingleton ?? options.databaseAdmission;
      if (databaseAdmission === undefined) {
        await options.task();
        return;
      }
      const admission = acquireBackgroundDatabaseAdmission(
        databaseAdmission.dataSource,
        databaseAdmission.priority,
      );
      this.cancelAdmission = admission.cancel;
      const releaseAdmission = await admission.ready;
      if (this.cancelAdmission === admission.cancel)
        this.cancelAdmission = undefined;
      try {
        // stop() also covers the microtask between granting admission and opening the runner.
        if (releaseAdmission === undefined || generation !== this.generation)
          return;
        const release = databaseAdmission.budget?.tryAcquire();
        if (databaseAdmission.budget !== undefined && release === undefined) {
          recordRuntimeBackgroundSkip(options.jobName);
          return;
        }
        try {
          if (clusterSingleton === undefined) await options.task();
          else await this.runClusterSingleton({ ...options, clusterSingleton });
        } finally {
          release?.();
        }
      } finally {
        releaseAdmission?.();
      }
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
