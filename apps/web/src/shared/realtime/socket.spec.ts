import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const SOUL_MESSAGE_EVENT = 'soul.message';

const realtimeMocks = vi.hoisted(() => {
  const manager = {
    on: vi.fn(),
    off: vi.fn(),
  };
  const socket = {
    connected: false,
    active: false,
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
    realtimeMocks.socket.active = false;
    vi.clearAllMocks();
    realtimeMocks.socket.connect.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    disconnectRealtime();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function emit(event: string, value?: unknown) {
    for (const [name, handler] of realtimeMocks.socket.on.mock.calls) {
      if (name === event) handler(value);
    }
  }

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
    expect(realtimeMocks.socket.off).toHaveBeenCalledWith(
      'connect',
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

  it.each(['CONNECTION_QUOTA_UNAVAILABLE', 'CONNECTION_LIMIT'])(
    'retries %s with one jittered timer and a finite budget',
    async (message) => {
      connectRealtime();
      for (let attempt = 0; attempt < 25; attempt += 1) {
        emit('connect_error', new Error(message));
        emit('connect_error', new Error(message));
        expect(vi.getTimerCount()).toBe(1);
        const cap = Math.min(30_000, 1_000 * 2 ** attempt);
        const before = realtimeMocks.socket.connect.mock.calls.length;
        await vi.advanceTimersByTimeAsync(cap / 2 - 1);
        expect(realtimeMocks.socket.connect).toHaveBeenCalledTimes(before);
        await vi.advanceTimersByTimeAsync(cap / 2 + 1);
        expect(realtimeMocks.socket.connect).toHaveBeenCalledTimes(before + 1);
      }
      emit('connect_error', new Error(message));
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it.each([90_000, 300_000])(
    'recovers after an orphaned %ims quota lease even with minimum jitter',
    async (leaseMs) => {
      vi.spyOn(Math, 'random').mockReturnValue(0);
      connectRealtime();
      const started = Date.now();
      const recovered = vi.fn();
      const unsubscribe = onReconnected(recovered);
      emit('connect');
      emit('disconnect', 'transport close');
      realtimeMocks.socket.connect.mockImplementation(() => {
        if (Date.now() - started < leaseMs) {
          emit('connect_error', new Error('CONNECTION_LIMIT'));
        } else {
          realtimeMocks.socket.connected = true;
          emit('connect');
        }
      });
      emit('connect_error', new Error('CONNECTION_LIMIT'));

      await vi.runAllTimersAsync();

      expect(Date.now() - started).toBeGreaterThanOrEqual(leaseMs);
      expect(realtimeMocks.socket.connected).toBe(true);
      expect(recovered).toHaveBeenCalledOnce();
      expect(realtimeMocks.refreshSession).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
      unsubscribe();
    },
  );

  it.each(['FORBIDDEN', 'UNKNOWN_ERROR'])(
    'does not retry permanent rejection %s',
    async (message) => {
      connectRealtime();
      emit('connect_error', new Error(message));
      await vi.runAllTimersAsync();
      expect(realtimeMocks.socket.connect).toHaveBeenCalledOnce();
      expect(realtimeMocks.refreshSession).not.toHaveBeenCalled();
    },
  );

  it('leaves transport retries to Socket.IO, and terminal server disconnects stopped', () => {
    connectRealtime();
    realtimeMocks.socket.active = true;
    emit('connect_error', new Error('websocket error'));
    expect(vi.getTimerCount()).toBe(0);
    realtimeMocks.socket.active = false;
    emit('disconnect', 'io server disconnect');
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['CONNECTION_QUOTA_UNAVAILABLE', 'CONNECTION_LIMIT'])(
    'logout cancels a pending %s retry',
    async (message) => {
      connectRealtime();
      emit('connect_error', new Error(message));
      disconnectRealtime();
      await vi.runAllTimersAsync();
      expect(realtimeMocks.socket.connect).toHaveBeenCalledOnce();
    },
  );

  it('refreshes auth once, backs off reconnect, and stops if refreshed auth is still rejected', async () => {
    realtimeMocks.refreshSession.mockResolvedValue(true);
    connectRealtime();
    emit('connect_error', new Error('UNAUTHORIZED'));
    emit('connect_error', new Error('UNAUTHORIZED'));
    await vi.runAllTimersAsync();
    expect(realtimeMocks.refreshSession).toHaveBeenCalledOnce();
    expect(realtimeMocks.socket.connect).toHaveBeenCalledTimes(2);
    emit('connect_error', new Error('UNAUTHORIZED'));
    await vi.runAllTimersAsync();
    expect(realtimeMocks.refreshSession).toHaveBeenCalledOnce();
    expect(realtimeMocks.socket.connect).toHaveBeenCalledTimes(2);
  });

  it('does not reconnect when auth refresh completes after logout', async () => {
    let resolve!: (restored: boolean) => void;
    realtimeMocks.refreshSession.mockReturnValue(
      new Promise<boolean>((done) => {
        resolve = done;
      }),
    );
    connectRealtime();
    emit('connect_error', new Error('UNAUTHORIZED'));
    disconnectRealtime();
    resolve(true);
    await vi.runAllTimersAsync();
    expect(realtimeMocks.socket.connect).toHaveBeenCalledOnce();
  });

  it('failed auth refresh does not become an unhandled rejection or retry loop', async () => {
    realtimeMocks.refreshSession.mockRejectedValue(new Error('offline'));
    connectRealtime();
    emit('connect_error', new Error('UNAUTHORIZED'));
    await vi.runAllTimersAsync();
    expect(realtimeMocks.socket.connect).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('resyncs only after a restored namespace is admitted, including manual retries', async () => {
    connectRealtime();
    const recovered = vi.fn();
    const unsubscribe = onReconnected(recovered);
    emit('connect');
    expect(recovered).not.toHaveBeenCalled();
    emit('disconnect', 'transport close');
    // A transport reconnect is not yet an authenticated namespace connection.
    expect(realtimeMocks.manager.on).not.toHaveBeenCalledWith(
      'reconnect',
      expect.any(Function),
    );
    emit('connect_error', new Error('CONNECTION_QUOTA_UNAVAILABLE'));
    await vi.runAllTimersAsync();
    expect(recovered).not.toHaveBeenCalled();
    emit('connect');
    expect(recovered).toHaveBeenCalledOnce();
    unsubscribe();
  });
});
