import type { RedisOptions } from 'ioredis';

const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 15_000;
const RECONNECT_JITTER_RATIO = 0.25;

/** Signaling outage backoff: keep automatic recovery without hammering hosted Redis per pod. */
export function signalingRedisReconnectDelay(
  attempt: number,
  random: () => number = Math.random,
): number {
  const exponent = Math.min(Math.max(attempt - 1, 0), 5);
  const capped = Math.min(RECONNECT_BASE_MS * 2 ** exponent, RECONNECT_MAX_MS);
  const jitter =
    1 - RECONNECT_JITTER_RATIO + random() * RECONNECT_JITTER_RATIO * 2;
  return Math.min(Math.round(capped * jitter), RECONNECT_MAX_MS);
}

/** Command clients fail fast; reconnect itself is independently backed off and jittered. */
export function signalingRedisClientOptions(): RedisOptions {
  return {
    connectTimeout: 1_000,
    commandTimeout: 1_000,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: signalingRedisReconnectDelay,
  };
}
