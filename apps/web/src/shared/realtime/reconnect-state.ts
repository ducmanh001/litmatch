/**
 * Coordinates the two recovery channels: Socket.IO reconnect resyncs durable state, while
 * React Query handles browser online recovery when the socket is absent or fails to reconnect.
 */
const SOCKET_RECONNECT_SUPPRESSION_WINDOW_MS = 2_000;

let lastSocketReconnectAt = 0;

export function markSocketReconnect(now = Date.now()): void {
  lastSocketReconnectAt = now;
}

export function resetSocketReconnectState(): void {
  lastSocketReconnectAt = 0;
}

export function shouldRefetchAfterOnlineReconnect(now = Date.now()): boolean {
  return (
    lastSocketReconnectAt === 0 ||
    now - lastSocketReconnectAt > SOCKET_RECONNECT_SUPPRESSION_WINDOW_MS
  );
}
