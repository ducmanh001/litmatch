/** Ephemeral fanout capability. Consumers must retain their REST polling fallback. */
export interface RealtimePublisherPort {
  publish(channel: string, payload: string): Promise<unknown>;
  /** Optional lifecycle hook for adapters that own a shared transport client. */
  close?(): Promise<void>;
}
