import { metrics } from '@opentelemetry/api';
import type { ConfigService } from '@nestjs/config';
import type {
  Consumer,
  ConsumerRunConfig,
  EachMessagePayload,
  EachMessageHandler,
  Producer,
} from 'kafkajs';
import { Kafka } from 'kafkajs';

import type { CoreApiEnv } from '../../config/env.validation';
import { KafkaEventBusAdapter } from './kafka-event-bus.adapter';
import type { EventEnvelope } from './event-bus.port';

jest.mock('kafkajs', () => ({ Kafka: jest.fn() }));

const kafkaMock = Kafka as unknown as jest.Mock;
const EVENT: EventEnvelope = {
  id: 'event-1',
  topic: 'litmatch.economy.events',
  type: 'economy.diamond.credited',
  version: 1,
  key: 'transaction-1',
  payload: { transactionId: 'transaction-1', userId: 'user-1', amount: '10' },
};

function config(
  overrides: Partial<CoreApiEnv> = {},
): ConfigService<CoreApiEnv, true> {
  const values: Partial<CoreApiEnv> = {
    KAFKA_BROKERS: 'broker:9092',
    EVENT_BUS_KAFKA_REQUEST_TIMEOUT_MS: 100,
    EVENT_BUS_KAFKA_RETRIES: 0,
    EVENT_BUS_CONSUMER_MAX_ATTEMPTS: 3,
    EVENT_BUS_CONSUMER_RETRY_DELAY_MS: 0,
    ...overrides,
  };
  return {
    getOrThrow: jest.fn((key: keyof CoreApiEnv) => values[key]),
  } as unknown as ConfigService<CoreApiEnv, true>;
}

describe('KafkaEventBusAdapter', () => {
  let producer: jest.Mocked<Producer>;
  let consumer: jest.Mocked<Consumer>;
  let eachMessage: EachMessageHandler;
  let adapter: KafkaEventBusAdapter;

  beforeEach(() => {
    producer = {
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
      send: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<Producer>;
    consumer = {
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
      subscribe: jest.fn().mockResolvedValue(undefined),
      run: jest.fn().mockImplementation(async (options: ConsumerRunConfig) => {
        eachMessage = options.eachMessage as EachMessageHandler;
      }),
    } as unknown as jest.Mocked<Consumer>;
    kafkaMock.mockImplementation(() => ({
      producer: jest.fn(() => producer),
      consumer: jest.fn(() => consumer),
    }));
    adapter = new KafkaEventBusAdapter(
      config(),
      metrics.getMeter('kafka-event-bus-adapter-test'),
    );
  });

  afterEach(async () => {
    await adapter.onApplicationShutdown();
    jest.clearAllMocks();
  });

  it('propagates broker failure and retries the same stable event on the next relay attempt', async () => {
    producer.send.mockRejectedValueOnce(new Error('broker unavailable'));

    await expect(adapter.publish(EVENT)).rejects.toThrow('broker unavailable');

    await expect(adapter.publish(EVENT)).resolves.toBeUndefined();
    expect(producer.connect).toHaveBeenCalledTimes(1);
    expect(producer.send).toHaveBeenCalledTimes(2);
    expect(producer.send.mock.calls[0]?.[0].messages[0]).toMatchObject({
      key: EVENT.key,
    });
    expect(producer.send.mock.calls[0]?.[0].messages[0].value).toBe(
      producer.send.mock.calls[1]?.[0].messages[0].value,
    );
  });

  it('retries a failed consumer handler a bounded number of times, then publishes the event to DLQ', async () => {
    const handler = jest.fn().mockRejectedValue(new Error('consumer failed'));
    await adapter.subscribe({
      topic: EVENT.topic,
      groupId: 'economy-consumer',
      maxAttempts: 3,
      handler,
    });

    const message = {
      topic: EVENT.topic,
      partition: 0,
      message: {
        offset: '7',
        value: Buffer.from(JSON.stringify(EVENT)),
      },
    } as EachMessagePayload;
    await expect(eachMessage(message)).resolves.toBeUndefined();

    expect(handler).toHaveBeenCalledTimes(3);
    expect(producer.send).toHaveBeenCalledTimes(1);
    const sent = producer.send.mock.calls[0]?.[0];
    expect(sent?.topic).toBe('litmatch.economy.events.DLQ');
    expect(JSON.parse(String(sent?.messages[0]?.value))).toMatchObject({
      id: EVENT.id,
      topic: 'litmatch.economy.events.DLQ',
      payload: {
        original: EVENT.payload,
        deadLetter: { attempts: 3, error: 'consumer failed' },
      },
    });
  });

  it('leaves the consumer delivery failed when DLQ publish is unavailable', async () => {
    producer.send.mockRejectedValue(new Error('DLQ broker unavailable'));
    const handler = jest.fn().mockRejectedValue(new Error('consumer failed'));
    await adapter.subscribe({
      topic: EVENT.topic,
      groupId: 'economy-consumer',
      maxAttempts: 2,
      handler,
    });

    await expect(
      eachMessage({
        topic: EVENT.topic,
        partition: 0,
        message: {
          offset: '8',
          value: Buffer.from(JSON.stringify(EVENT)),
        },
      } as EachMessagePayload),
    ).rejects.toThrow('DLQ broker unavailable');
    expect(handler).toHaveBeenCalledTimes(2);
  });
});
