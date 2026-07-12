'use client';

import { RealtimeConnectionErrors } from '@litmatch/common-dtos/pure';
import { io } from 'socket.io-client';

import { apiClient, tokenStore } from '../api/client';
import { env } from '../env';

import type {
  RealtimeEnvelope,
  RealtimeEventName,
} from '@litmatch/common-dtos/pure';
import type { Socket } from 'socket.io-client';

/**
 * MỘT socket instance cho cả app (docs/13 § 13.8) — component không tự io(), chỉ đi qua
 * subscribeRealtime/onReconnected. Socket là kênh DELTA: sau reconnect phải refetch state
 * nền qua REST (onReconnected → invalidate query), không đoán state từ event bị miss.
 */
let socket: Socket | null = null;
let authRefreshInFlight: Promise<void> | null = null;

function getSocket(): Socket {
  if (socket === null) {
    socket = io(env.NEXT_PUBLIC_SOCKET_URL, {
      // Gateway verify JWT lúc handshake — callback lấy token tươi mỗi lần (re)connect.
      auth: (cb) => cb({ token: tokenStore.getAccessToken() }),
      autoConnect: false,
    });
    const current = socket;
    current.on('connect_error', (error: Error) => {
      if (error.message !== RealtimeConnectionErrors.Unauthorized) return;
      authRefreshInFlight ??= apiClient
        .refreshSession()
        .then((restored) => {
          if (restored && socket === current) current.connect();
        })
        .finally(() => {
          authRefreshInFlight = null;
        });
    });
  }
  return socket;
}

/** Gọi khi user đã đăng nhập và vào vùng realtime; idempotent. */
export function connectRealtime(): void {
  const s = getSocket();
  if (!s.connected) s.connect();
}

/** Gọi khi logout — đóng kết nối và quên instance (token user khác không dùng lại socket cũ). */
export function disconnectRealtime(): void {
  socket?.disconnect();
  socket = null;
  authRefreshInFlight = null;
}

/** Đăng ký listener theo event đã khai trong common-dtos — trả cleanup, hook PHẢI gọi khi unmount. */
export function subscribeRealtime<T>(
  event: RealtimeEventName,
  handler: (data: RealtimeEnvelope<T>['data']) => void,
): () => void {
  const s = getSocket();
  s.on(event, handler);
  return () => s.off(event, handler);
}

/** Đăng ký callback sau khi socket nối LẠI (không phải lần connect đầu) — nơi refetch REST. */
export function onReconnected(handler: () => void): () => void {
  const s = getSocket();
  const wrapped = (attempt: number): void => {
    if (attempt > 0) handler();
  };
  s.io.on('reconnect', wrapped);
  return () => s.io.off('reconnect', wrapped);
}
