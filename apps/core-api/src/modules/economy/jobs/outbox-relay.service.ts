import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { Kafka, Producer } from 'kafkajs';
import { DataSource } from 'typeorm';

import { ManagedInterval } from '../../../common/scheduling/managed-interval';
import type { CoreApiEnv } from '../../../config/env.validation';
import { OutboxEvent } from '../entities/outbox-event.entity';

const RELAY_JOB = 'economy-outbox-relay';
const BATCH_SIZE = 100;

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
  private producer: Producer | null = null;
  private readonly job = new ManagedInterval();

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService<CoreApiEnv, true>,
    private readonly scheduler: SchedulerRegistry,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (
      !this.config.getOrThrow('ECONOMY_OUTBOX_RELAY_ENABLED', { infer: true })
    )
      return;

    const kafka = new Kafka({
      clientId: 'core-api-outbox-relay',
      brokers: this.config
        .getOrThrow('KAFKA_BROKERS', { infer: true })
        .split(','),
    });
    this.producer = kafka.producer();
    await this.producer.connect();

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
    this.job.stop();
    await this.producer?.disconnect();
  }

  /** 1 vòng relay — public để test/chạy tay. */
  async flushOnce(): Promise<number> {
    return this.job.runExclusive(async () => {
      return await this.dataSource.transaction(async (manager) => {
        const events: OutboxEvent[] = await manager
          .getRepository(OutboxEvent)
          .createQueryBuilder('e')
          .setLock('pessimistic_write')
          .setOnLocked('skip_locked')
          .where('e.published_at IS NULL')
          .orderBy('e.created_at', 'ASC')
          .limit(BATCH_SIZE)
          .getMany();
        if (events.length === 0) return 0;

        for (const event of events) {
          try {
            await this.producer?.send({
              topic: event.topic,
              messages: [
                {
                  key: event.eventType,
                  value: JSON.stringify({
                    id: event.id,
                    type: event.eventType,
                    ...event.payload,
                  }),
                },
              ],
            });
            event.publishedAt = new Date();
          } catch (err) {
            event.attempts += 1;
            this.logger.error(
              { eventId: event.id, err: `${err}` },
              'Publish event thất bại, sẽ retry',
            );
          }
        }
        await manager.save(events);
        return events.filter((e) => e.publishedAt).length;
      });
    }, 0);
  }
}
