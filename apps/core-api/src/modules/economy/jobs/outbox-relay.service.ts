import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { EventBusPort, type EventEnvelope } from '../../../common/events';
import { ManagedInterval } from '../../../common/scheduling/managed-interval';
import type { CoreApiEnv } from '../../../config/env.validation';
import { OutboxEvent } from '../entities/outbox-event.entity';

const RELAY_JOB = 'economy-outbox-relay';
const BATCH_SIZE = 100;
const DEFAULT_EVENT_VERSION = 1;
const ORDERING_KEY_FIELDS = ['transactionId', 'userId'] as const;
const MAX_ERROR_LENGTH = 2_000;

/**
 * Relay của Outbox Pattern (docs/03 § 3.6): đọc event chưa publish
 * (FOR UPDATE SKIP LOCKED — nhiều instance chạy song song không dẫm nhau),
 * publish Kafka rồi đánh dấu. Bật/tắt bằng ECONOMY_OUTBOX_RELAY_ENABLED.
 */
@Injectable()
export class OutboxRelayService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(OutboxRelayService.name);
  private readonly job = new ManagedInterval();
  private stopping = false;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService<CoreApiEnv, true>,
    private readonly scheduler: SchedulerRegistry,
    private readonly eventBus: EventBusPort,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    this.stopping = false;
    if (
      !this.config.getOrThrow('ECONOMY_OUTBOX_RELAY_ENABLED', { infer: true })
    ) {
      this.logger.warn(
        'Outbox relay is disabled: unpublished events are retained and require a consumer/relay before scale',
      );
      return;
    }

    this.job.start(this.scheduler, {
      jobName: RELAY_JOB,
      intervalMs: this.config.getOrThrow('ECONOMY_OUTBOX_RELAY_INTERVAL_MS', {
        infer: true,
      }),
      task: () => this.flushOnce(),
      logger: this.logger,
      errorMessage: 'Outbox relay lỗi',
    });
    this.logger.log('Outbox relay đã bật');
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopping = true;
    this.job.stop();
  }

  /** 1 vòng relay — public để test/chạy tay. */
  async flushOnce(): Promise<number> {
    return this.job.runExclusive(async () => {
      const deadline =
        Date.now() +
        this.config.getOrThrow('ECONOMY_OUTBOX_RELAY_TICK_BUDGET_MS', {
          infer: true,
        });
      const maxBatches = this.config.getOrThrow(
        'ECONOMY_OUTBOX_RELAY_MAX_BATCHES_PER_TICK',
        { infer: true },
      );
      let published = 0;
      for (let batch = 0; batch < maxBatches && !this.stopping; batch++) {
        if (batch > 0 && Date.now() >= deadline) break;
        const count = await this.flushBatch(deadline);
        published += count;
        // Stop on a short or failed batch, rather than burning retry/DLQ attempts in one tick.
        if (count < BATCH_SIZE) break;
      }
      return published;
    }, 0);
  }

  private async flushBatch(deadline: number): Promise<number> {
    return this.dataSource.transaction(async (manager) => {
      const events: OutboxEvent[] = await manager
        .getRepository(OutboxEvent)
        .createQueryBuilder('e')
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .where('e.published_at IS NULL')
        .andWhere('e.dead_lettered_at IS NULL')
        .orderBy('e.created_at', 'ASC')
        .limit(BATCH_SIZE)
        .getMany();
      if (events.length === 0) return 0;

      let attempted = 0;
      for (const event of events) {
        if (this.stopping || (attempted > 0 && Date.now() >= deadline)) break;
        attempted++;
        try {
          await this.eventBus.publish(toEventEnvelope(event));
          event.publishedAt = new Date();
          event.lastError = null;
        } catch (err) {
          event.attempts += 1;
          event.lastError = stringifyError(err);
          this.logger.error(
            {
              eventId: event.id,
              topic: event.topic,
              attempts: event.attempts,
              maxAttempts: this.maxAttempts(),
              err: event.lastError,
            },
            'Outbox event publish failed',
          );
          if (event.attempts >= this.maxAttempts()) {
            await this.deadLetter(event);
          }
          // A broker outage must not consume all 100 network deadlines while holding DB locks.
          break;
        }
      }
      await manager.save(events);
      return events.filter((e) => e.publishedAt).length;
    });
  }

  private maxAttempts(): number {
    return this.config.getOrThrow('ECONOMY_OUTBOX_MAX_ATTEMPTS', {
      infer: true,
    });
  }

  private async deadLetter(event: OutboxEvent): Promise<void> {
    try {
      await this.eventBus.publishDeadLetter(
        toEventEnvelope(event),
        event.lastError ?? 'unknown publish failure',
        event.attempts,
      );
      this.logger.error(
        {
          eventId: event.id,
          topic: event.topic,
          attempts: event.attempts,
          deadLetterTopic: `${event.topic}.DLQ`,
        },
        'Outbox event moved to dead-letter topic',
      );
    } catch (deadLetterError) {
      // Keep the payload and mark it terminal even if Kafka is still down. This prevents an
      // infinite retry loop; the retained row is the operator replay source of truth.
      this.logger.error(
        {
          eventId: event.id,
          topic: event.topic,
          attempts: event.attempts,
          err: stringifyError(deadLetterError),
        },
        'Outbox dead-letter publish failed; retaining terminal row for replay',
      );
    } finally {
      event.deadLetteredAt = new Date();
    }
  }
}

function toEventEnvelope(event: OutboxEvent): EventEnvelope {
  return {
    id: event.id,
    topic: event.topic,
    type: event.eventType,
    version: eventVersion(event.payload),
    key: orderingKey(event),
    payload: event.payload,
  };
}

function eventVersion(payload: Record<string, unknown>): number {
  const version = payload['version'];
  return typeof version === 'number' && Number.isInteger(version)
    ? version
    : DEFAULT_EVENT_VERSION;
}

function orderingKey(event: OutboxEvent): string {
  for (const field of ORDERING_KEY_FIELDS) {
    const value = event.payload[field];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return event.id;
}

function stringifyError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, MAX_ERROR_LENGTH);
}
