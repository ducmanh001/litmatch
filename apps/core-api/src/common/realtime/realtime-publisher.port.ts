/** Ephemeral fanout capability. Consumers must retain their REST polling fallback. */
export interface RealtimePublisherPort {
  publish(channel: string, payload: string): Promise<unknown>;
}
