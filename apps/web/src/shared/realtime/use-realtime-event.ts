'use client';

import { useEffect } from 'react';

import { subscribeRealtime } from './socket';

import type { RealtimeEventName } from '@litmatch/common-dtos/pure';

/**
 * Nghe 1 realtime event với cleanup tự động (docs/13 § 13.8 — listener rò là bug mặc định).
 * `handler` nên ổn định (useCallback) hoặc chấp nhận re-subscribe mỗi render thay đổi.
 */
export function useRealtimeEvent<T>(
  event: RealtimeEventName,
  handler: (data: T) => void,
): void {
  useEffect(() => subscribeRealtime<T>(event, handler), [event, handler]);
}
