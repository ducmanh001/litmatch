import { beforeEach, describe, expect, it, vi } from 'vitest';

const SOUL_MESSAGE_EVENT = 'soul.message';

const realtimeMocks = vi.hoisted(() => {
  const manager = {
    on: vi.fn(),
    off: vi.fn(),
  };
  const socket = {
    connected: false,
    connect: vi.fn(),
    disconnect: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    io: manager,
  };

  return {
    io: vi.fn(() => socket),
    manager,
    refreshSession: vi.fn(),
    socket,
    getAccessToken: vi.fn(() => 'access-token'),
  };
});

vi.mock('socket.io-client', () => ({ io: realtimeMocks.io }));

vi.mock('../api/client', () => ({
  apiClient: { refreshSession: realtimeMocks.refreshSession },
  tokenStore: { getAccessToken: realtimeMocks.getAccessToken },
}));

vi.mock('../env', () => ({
  env: { NEXT_PUBLIC_SOCKET_URL: 'https://socket.example.com' },
}));

import {
  connectRealtime,
  disconnectRealtime,
  onReconnected,
  subscribeRealtime,
} from './socket';

describe('realtime socket', () => {
  beforeEach(() => {
    disconnectRealtime();
    realtimeMocks.socket.connected = false;
    vi.clearAllMocks();
  });

  it('giữ reconnect vô hạn với WebSocket và backoff giới hạn', () => {
    connectRealtime();

    expect(realtimeMocks.io).toHaveBeenCalledWith(
      'https://socket.example.com/signaling',
      {
        auth: expect.any(Function),
        autoConnect: false,
        transports: ['websocket'],
        reconnectionAttempts: Infinity,
        reconnectionDelayMax: 30_000,
        randomizationFactor: 0.5,
        timeout: 10_000,
      },
    );
    expect(realtimeMocks.socket.connect).toHaveBeenCalledOnce();
  });

  it('giữ cleanup listener event và reconnect', () => {
    const eventHandler = vi.fn();
    const reconnectHandler = vi.fn();

    const unsubscribeEvent = subscribeRealtime(
      SOUL_MESSAGE_EVENT,
      eventHandler,
    );
    const unsubscribeReconnect = onReconnected(reconnectHandler);

    unsubscribeEvent();
    unsubscribeReconnect();

    expect(realtimeMocks.socket.off).toHaveBeenCalledWith(
      SOUL_MESSAGE_EVENT,
      eventHandler,
    );
    expect(realtimeMocks.manager.off).toHaveBeenCalledWith(
      'reconnect',
      expect.any(Function),
    );
  });

  it('disconnect quên instance để user sau không dùng lại socket cũ', () => {
    connectRealtime();
    disconnectRealtime();
    connectRealtime();

    expect(realtimeMocks.socket.disconnect).toHaveBeenCalledOnce();
    expect(realtimeMocks.io).toHaveBeenCalledTimes(2);
  });
});
