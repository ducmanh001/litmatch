/**
 * Durable event transport boundary. Business modules must not depend on KafkaJS or any other
 * broker client; durable business events are first written to the outbox and this port is used
 * by the relay/consumer boundary after the database transaction has committed.
 */
export interface EventEnvelope {
  id: string;
  topic: string;
  type: string;
  version: number;
  key: string;
  payload: Record<string, unknown>;
}

export interface EventSubscription {
  topic: string;
  groupId: string;
  fromBeginning?: boolean;
  maxAttempts?: number;
  handler: (event: EventEnvelope) => Promise<void>;
}

export abstract class EventBusPort {
  abstract publish(event: EventEnvelope): Promise<void>;

  /**
   * Publish a terminal failure without hiding the original event. The caller keeps the original
   * outbox row so an operator can inspect or replay it even when the broker/DLQ is unavailable.
   */
  abstract publishDeadLetter(
    event: EventEnvelope,
    error: string,
    attempts: number,
  ): Promise<void>;

  abstract subscribe(subscription: EventSubscription): Promise<void>;
}
