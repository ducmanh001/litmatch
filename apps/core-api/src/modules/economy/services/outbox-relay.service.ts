import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { Kafka, Producer } from 'kafkajs';
import { DataSource } from 'typeorm';

import { OutboxEvent } from '../entities/outbox-event.entity';

const RELAY_JOB = 'economy-outbox-relay';
const BATCH_SIZE = 100;

/**
 * Relay của Outbox Pattern (docs/03 § 3.6): đọc event chưa publish
 * (FOR UPDATE SKIP LOCKED — nhiều instance chạy song song không dẫm nhau),
 * publish Kafka rồi đánh dấu. Bật/tắt bằng ECONOMY_OUTBOX_RELAY_ENABLED.
 */
@Injectable()
export class OutboxRelayService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(OutboxRelayService.name);
  private producer: Producer | null = null;
  private running = false;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly scheduler: SchedulerRegistry,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.config.getOrThrow<boolean>('ECONOMY_OUTBOX_RELAY_ENABLED')) return;

    const kafka = new Kafka({
      clientId: 'core-api-outbox-relay',
      brokers: this.config.getOrThrow<string>('KAFKA_BROKERS').split(','),
    });
    this.producer = kafka.producer();
    await this.producer.connect();

    const interval = setInterval(
      () => void this.flushOnce().catch((err) => this.logger.error({ err: `${err}` }, 'Outbox relay lỗi')),
      this.config.getOrThrow<number>('ECONOMY_OUTBOX_RELAY_INTERVAL_MS'),
    );
    this.scheduler.addInterval(RELAY_JOB, interval);
    this.logger.log('Outbox relay đã bật');
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.scheduler.doesExist('interval', RELAY_JOB)) this.scheduler.deleteInterval(RELAY_JOB);
    await this.producer?.disconnect();
  }

  /** 1 vòng relay — public để test/chạy tay. */
  async flushOnce(): Promise<number> {
    if (this.running) return 0; // vòng trước chưa xong thì bỏ qua, không chồng
    this.running = true;
    try {
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
              messages: [{ key: event.eventType, value: JSON.stringify({ id: event.id, type: event.eventType, ...event.payload }) }],
            });
            event.publishedAt = new Date();
          } catch (err) {
            event.attempts += 1;
            this.logger.error({ eventId: event.id, err: `${err}` }, 'Publish event thất bại, sẽ retry');
          }
        }
        await manager.save(events);
        return events.filter((e) => e.publishedAt).length;
      });
    } finally {
      this.running = false;
    }
  }
}
