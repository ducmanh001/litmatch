import { shouldRefetchAfterOnlineReconnect } from '../realtime/reconnect-state';

/**
 * React Query retry policy for REST requests.
 *
 * A retry is useful for a transient network/server failure, but retrying a 4xx response
 * multiplies traffic for an error the client cannot repair. Keep the global budget at one
 * retry; feature-specific mutations can still opt out when their operation is not safe to
 * replay.
 */
export function shouldRetryQuery(
  failureCount: number,
  error: unknown,
): boolean {
  if (failureCount >= 1) return false;

  const status = getHttpStatus(error);
  if (status === undefined) return false;

  return status === 0 || status === 408 || status === 425 || status >= 500;
}

/** Avoid the one overlapping online refetch already covered by socket REST resync. */
export function shouldRefetchOnReconnect(): boolean {
  return shouldRefetchAfterOnlineReconnect();
}

function getHttpStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('status' in error)) {
    return undefined;
  }
  const status = error.status;
  return typeof status === 'number' ? status : undefined;
}
