import type { Logger } from '@nestjs/common';
import type { SchedulerRegistry } from '@nestjs/schedule';

/**
 * Quản lý lifecycle và chống overlap cho một interval trong một process.
 * Correctness giữa nhiều process vẫn phải do transaction, lock hoặc idempotency của domain giữ.
 */
export class ManagedInterval {
  private running = false;
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
    },
  ): void {
    const interval = setInterval(
      () =>
        void options
          .task()
          .catch((error: unknown) =>
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
}
