/** Stable transport identifiers are kept here so producers and consumers share one vocabulary. */
export const EVENT_BUS_CLIENT_ID = 'core-api-event-bus';
export const EVENT_BUS_DEAD_LETTER_SUFFIX = '.DLQ';

export function deadLetterTopic(topic: string): string {
  return `${topic}${EVENT_BUS_DEAD_LETTER_SUFFIX}`;
}
