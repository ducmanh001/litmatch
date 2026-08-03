'use client';

import { useSyncExternalStore } from 'react';

import { isRealtimeConnected, subscribeRealtimeConnection } from './socket';

/** Transport khỏe thì giảm tần suất reconciliation; mất socket thì poll sát hơn. */
export function useRealtimeConnection(): boolean {
  return useSyncExternalStore(
    subscribeRealtimeConnection,
    isRealtimeConnected,
    () => false,
  );
}
