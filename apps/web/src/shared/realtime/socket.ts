'use client';

import { RealtimeConnectionErrors } from '@litmatch/common-dtos/pure';
import { io } from 'socket.io-client';

import { apiClient, tokenStore } from '../api/client';
import { env } from '../env';
import {
  markSocketReconnect,
  resetSocketReconnectState,
} from './reconnect-state';

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
let cancelRecovery: (() => void) | null = null;
/** Namespace middleware failures do not trigger Socket.IO's transport reconnection. */
const QUOTA_UNAVAILABLE_ERROR = 'CONNECTION_QUOTA_UNAVAILABLE';
const CONNECTION_LIMIT_ERROR = 'CONNECTION_LIMIT';
// Minimum equal jitter spans 315.5s, beyond the maximum supported 300s quota lease.
const MAX_ADMISSION_RETRIES = 25;
const RETRY_BASE_MS = 1_000;
const RETRY_MAX_MS = 30_000;
let realtimeConnected = false;
const realtimeConnectionListeners = new Set<() => void>();

function setRealtimeConnected(next: boolean): void {
  if (realtimeConnected === next) return;
  realtimeConnected = next;
  for (const listener of realtimeConnectionListeners) listener();
}

function getSocket(): Socket {
  if (socket === null) {
    // `SignalingGateway` đăng ký ở namespace `/signaling` (apps/signaling-gateway/src/app/
    // signaling.gateway.ts — `@WebSocketGateway({ namespace: '/signaling' })`), KHÔNG phải
    // namespace mặc định `/`. Thiếu suffix này thì handshake vẫn "thành công" ở tầng transport
    // (Engine.IO không biết gì về namespace) nhưng client rơi vào namespace `/` không tồn tại
    // gateway nào lắng nghe — không bao giờ authenticate, không join room, không bao giờ nhận
    // được event nào, mà không có lỗi nào hiện ra (phát hiện qua verify thật bằng browser thật,
    // không phải unit test — REST poll fallback ở mọi feature đã che mất triệu chứng bấy lâu).
    socket = io(`${env.NEXT_PUBLIC_SOCKET_URL}/signaling`, {
      // Gateway verify JWT lúc handshake — callback lấy token tươi mỗi lần (re)connect.
      auth: (cb) => cb({ token: tokenStore.getAccessToken() }),
      autoConnect: false,
      transports: ['websocket'],
      reconnectionAttempts: Infinity,
      reconnectionDelayMax: 30_000,
      randomizationFactor: 0.5,
      timeout: 10_000,
    });
    const current = socket;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    let refreshedAuth = false;
    const cancelRetry = () => {
      if (retryTimer !== undefined) clearTimeout(retryTimer);
      retryTimer = undefined;
    };
    cancelRecovery = cancelRetry;
    const retryAdmission = () => {
      if (
        socket !== current ||
        current.connected ||
        current.active ||
        retryTimer !== undefined ||
        attempts >= MAX_ADMISSION_RETRIES
      )
        return;
      const cap = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** attempts++);
      // Equal jitter: never retry immediately; one timer per socket, bounded total attempts.
      retryTimer = setTimeout(
        () => {
          retryTimer = undefined;
          if (socket === current && !current.connected && !current.active) {
            current.connect();
          }
        },
        cap * (0.5 + Math.random() * 0.5),
      );
    };
    current.on('connect', () => {
      if (socket !== current) return;
      cancelRetry();
      attempts = 0;
      refreshedAuth = false;
      setRealtimeConnected(true);
    });
    current.on('disconnect', () => {
      if (socket === current) setRealtimeConnected(false);
    });
    current.on('connect_error', (error: Error) => {
      if (socket !== current) return;
      setRealtimeConnected(false);
      if (
        error.message === QUOTA_UNAVAILABLE_ERROR ||
        error.message === CONNECTION_LIMIT_ERROR
      ) {
        retryAdmission();
        return;
      }
      cancelRetry();
      // Unknown namespace rejections are terminal for this connection.
      // Transport failures keep Socket.IO's existing jittered reconnection (current.active).
      if (
        error.message !== RealtimeConnectionErrors.Unauthorized ||
        refreshedAuth
      )
        return;
      refreshedAuth = true;
      void apiClient
        .refreshSession()
        .then((restored) => {
          if (restored) retryAdmission();
        })
        .catch(() => {
          // REST recovery remains the fallback; never loop refresh requests on rejected auth.
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
  cancelRecovery?.();
  cancelRecovery = null;
  const previous = socket;
  socket = null;
  previous?.disconnect();
  setRealtimeConnected(false);
  resetSocketReconnectState();
}

/** Snapshot cho query fallback — realtime là delta, còn REST vẫn là reconciliation backstop. */
export function isRealtimeConnected(): boolean {
  return realtimeConnected;
}

/** Subscribe trạng thái transport để các query đổi tần suất fallback mà không polling mù. */
export function subscribeRealtimeConnection(listener: () => void): () => void {
  realtimeConnectionListeners.add(listener);
  return () => realtimeConnectionListeners.delete(listener);
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
  let connectedOnce = s.connected;
  const wrapped = (): void => {
    if (connectedOnce) {
      markSocketReconnect();
      handler();
    }
    connectedOnce = true;
  };
  // Namespace connect happens AFTER authentication/admission, including manual middleware retries.
  s.on('connect', wrapped);
  return () => s.off('connect', wrapped);
}
