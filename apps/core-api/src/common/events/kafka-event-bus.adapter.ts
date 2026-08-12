import {
  Inject,
  Injectable,
  Logger,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Meter } from '@opentelemetry/api';
import {
  Kafka,
  type Consumer,
  type EachMessagePayload,
  type Producer,
} from 'kafkajs';

import type { CoreApiEnv } from '../../config/env.validation';
import { METRICS_METER } from '../metrics/metrics.constants';
import { deadLetterTopic, EVENT_BUS_CLIENT_ID } from './events.constants';
import {
  EventBusPort,
  type EventEnvelope,
  type EventSubscription,
} from './event-bus.port';

const MAX_ERROR_LENGTH = 2_000;

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, MAX_ERROR_LENGTH);
}

function delay(milliseconds: number): Promise<void> {
  if (milliseconds <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

@Injectable()
export class KafkaEventBusAdapter
  extends EventBusPort
  implements OnApplicationShutdown
{
  private readonly logger = new Logger(KafkaEventBusAdapter.name);
  private readonly kafka: Kafka;
  private producer: Producer | null = null;
  private producerConnect: Promise<Producer> | null = null;
  private readonly consumers = new Set<Consumer>();

  private readonly publishTotal;
  private readonly publishFailureTotal;
  private readonly consumerFailureTotal;
  private readonly deadLetterTotal;

  constructor(
    private readonly config: ConfigService<CoreApiEnv, true>,
    @Inject(METRICS_METER) meter: Meter,
  ) {
    super();
    const brokers = this.config
      .getOrThrow('KAFKA_BROKERS', { infer: true })
      .split(',')
      .map((broker) => broker.trim())
      .filter(Boolean);
    this.kafka = new Kafka({
      clientId: EVENT_BUS_CLIENT_ID,
      brokers,
      connectionTimeout: this.config.getOrThrow(
        'EVENT_BUS_KAFKA_REQUEST_TIMEOUT_MS',
        {
          infer: true,
        },
      ),
      requestTimeout: this.config.getOrThrow(
        'EVENT_BUS_KAFKA_REQUEST_TIMEOUT_MS',
        {
          infer: true,
        },
      ),
      retry: {
        retries: this.config.getOrThrow('EVENT_BUS_KAFKA_RETRIES', {
          infer: true,
        }),
      },
    });

    this.publishTotal = meter.createCounter('event_bus_publish_total', {
      description: 'Events sent to the broker by outcome and topic.',
    });
    this.publishFailureTotal = meter.createCounter(
      'event_bus_publish_failure_total',
      {
        description: 'Event publish failures handed back to the outbox relay.',
      },
    );
    this.consumerFailureTotal = meter.createCounter(
      'event_bus_consumer_failure_total',
      {
        description:
          'Consumer handler failures before retry or dead-letter handling.',
      },
    );
    this.deadLetterTotal = meter.createCounter('event_bus_dead_letter_total', {
      description: 'Events moved to a broker dead-letter topic.',
    });
  }

  async publish(event: EventEnvelope): Promise<void> {
    try {
      const producer = await this.getProducer();
      await producer.send({
        topic: event.topic,
        messages: [
          {
            // The stable event id is part of the message so downstream consumers can dedupe.
            key: event.key,
            value: JSON.stringify(event),
          },
        ],
      });
      this.publishTotal.add(1, {
        topic: event.topic,
        type: event.type,
        outcome: 'success',
      });
    } catch (error) {
      this.publishFailureTotal.add(1, { topic: event.topic, type: event.type });
      this.logger.error(
        { eventId: event.id, topic: event.topic, err: errorMessage(error) },
        'Event publish failed; caller must retain the outbox row',
      );
      throw error;
    }
  }

  async publishDeadLetter(
    event: EventEnvelope,
    error: string,
    attempts: number,
  ): Promise<void> {
    const dlqEvent: EventEnvelope = {
      ...event,
      topic: deadLetterTopic(event.topic),
      payload: {
        original: event.payload,
        deadLetter: { error, attempts },
      },
    };
    await this.publish(dlqEvent);
    this.deadLetterTotal.add(1, { topic: event.topic, type: event.type });
  }

  async subscribe(subscription: EventSubscription): Promise<void> {
    const consumer = this.kafka.consumer({ groupId: subscription.groupId });
    this.consumers.add(consumer);
    try {
      await consumer.connect();
      await consumer.subscribe({
        topic: subscription.topic,
        fromBeginning: subscription.fromBeginning ?? false,
      });
      await consumer.run({
        eachMessage: (message) => this.handleMessage(subscription, message),
      });
    } catch (error) {
      this.consumers.delete(consumer);
      await consumer.disconnect().catch(() => undefined);
      throw error;
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.all(
      [...this.consumers].map((consumer) =>
        consumer.disconnect().catch(() => undefined),
      ),
    );
    this.consumers.clear();
    await this.producer?.disconnect().catch(() => undefined);
    this.producer = null;
    this.producerConnect = null;
  }

  private async getProducer(): Promise<Producer> {
    if (this.producer !== null) return this.producer;
    if (this.producerConnect !== null) return this.producerConnect;

    const producer = this.kafka.producer({
      // One in-flight request and Kafka idempotence preserve ordering for a stable key and make
      // producer-level retries safe. The outbox still remains at-least-once across DB crashes.
      idempotent: true,
      maxInFlightRequests: 1,
      retry: {
        retries: this.config.getOrThrow('EVENT_BUS_KAFKA_RETRIES', {
          infer: true,
        }),
      },
    });
    this.producerConnect = producer
      .connect()
      .then(() => {
        this.producer = producer;
        return producer;
      })
      .catch((error: unknown) => {
        this.producerConnect = null;
        throw error;
      });
    return this.producerConnect;
  }

  private async handleMessage(
    subscription: EventSubscription,
    { topic, partition, message }: EachMessagePayload,
  ): Promise<void> {
    const event = this.decodeEvent(topic, partition, message);
    const maxAttempts =
      subscription.maxAttempts ??
      this.config.getOrThrow('EVENT_BUS_CONSUMER_MAX_ATTEMPTS', {
        infer: true,
      });
    const retryDelayMs = this.config.getOrThrow(
      'EVENT_BUS_CONSUMER_RETRY_DELAY_MS',
      {
        infer: true,
      },
    );
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await subscription.handler(event);
        return;
      } catch (error) {
        lastError = error;
        this.consumerFailureTotal.add(1, {
          topic,
          type: event.type,
          outcome: attempt === maxAttempts ? 'exhausted' : 'retry',
        });
        this.logger.warn(
          {
            eventId: event.id,
            topic,
            partition,
            attempt,
            maxAttempts,
            err: errorMessage(error),
          },
          'Event consumer handler failed',
        );
        if (attempt < maxAttempts) await delay(retryDelayMs);
      }
    }

    try {
      await this.publishDeadLetter(event, errorMessage(lastError), maxAttempts);
    } catch (error) {
      // Throwing keeps the Kafka offset uncommitted. A broker/DLQ outage must not turn a failed
      // consumer event into an acknowledged, lost event.
      this.logger.error(
        { eventId: event.id, topic, err: errorMessage(error) },
        'Event DLQ publish failed; leaving Kafka offset uncommitted',
      );
      throw error;
    }
  }

  private decodeEvent(
    topic: string,
    partition: number,
    message: EachMessagePayload['message'],
  ): EventEnvelope {
    const raw = message.value?.toString();
    if (raw === undefined) {
      throw new Error(
        `Kafka message ${topic}/${partition}/${message.offset} has no value`,
      );
    }
    const parsed: unknown = JSON.parse(raw);
    if (!isEventEnvelope(parsed)) {
      throw new Error(
        `Kafka message ${topic}/${partition}/${message.offset} is not an event envelope`,
      );
    }
    return parsed;
  }
}

function isEventEnvelope(value: unknown): value is EventEnvelope {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<EventEnvelope>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.topic === 'string' &&
    typeof candidate.type === 'string' &&
    Number.isInteger(candidate.version) &&
    typeof candidate.key === 'string' &&
    typeof candidate.payload === 'object' &&
    candidate.payload !== null
  );
}
