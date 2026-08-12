/**
 * Ephemeral request quota only. Durable business state, including Economy, remains in Postgres.
 */
export interface RateLimitPort {
  consume(request: RateLimitConsumeRequest): Promise<RateLimitConsumeResult>;
  refund(reservation: RateLimitReservation): Promise<boolean>;
  /** Optional lifecycle hook for adapters that own a shared transport client. */
  close?(): Promise<void>;
}

export interface RateLimitConsumeRequest {
  key: string;
  limit: number;
  windowSeconds: number;
  /** Reusing this ID makes a retried consume idempotent until it is refunded or expires. */
  operationId?: string;
}

export interface RateLimitReservation {
  readonly rateLimitKey: string;
  readonly reservationKey: string;
  readonly windowKey: string;
}

export type RateLimitConsumeResult =
  | {
      allowed: true;
      /** True when the supplied operationId had already consumed this slot. */
      deduplicated: boolean;
      reservation: RateLimitReservation;
    }
  | {
      allowed: false;
      deduplicated: false;
    };
