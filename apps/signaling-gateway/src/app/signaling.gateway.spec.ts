import { EventEmitter } from 'node:events';

import { SignalingGateway } from './signaling.gateway';

import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import type { Socket } from 'socket.io';

import type { SignalingEnv } from '../config/env.validation';
import type { ConnectionQuotaService } from './connection-quota.service';

function makeGateway(verifyImpl?: jest.Mock): {
  gateway: SignalingGateway;
  connectionQuota: ConnectionQuotaService;
  emit: jest.Mock;
  to: jest.Mock;
} {
  const jwtService = {
    verifyAsync:
      verifyImpl ?? jest.fn(async () => ({ sub: 'user-1', isGuest: false })),
  } as unknown as JwtService;
  const config = {
    getOrThrow: (key: string) => {
      if (key === 'REDIS_URL') return 'redis://localhost:6379';
      throw new Error(`missing config ${key}`);
    },
  } as unknown as ConfigService<SignalingEnv, true>;
  const connectionQuota = {
    leaseMs: 90_000,
    maxConnections: 3,
    isReady: jest.fn(() => true),
    acquire: jest.fn(async () => true),
    refresh: jest.fn(async () => true),
    release: jest.fn(async () => undefined),
    onUnavailable: jest.fn(() => jest.fn()),
  } as unknown as ConnectionQuotaService;
  const gateway = new SignalingGateway(jwtService, config, connectionQuota);
  const emit = jest.fn();
  const to = jest.fn(() => ({ emit }));
  // gán server mock (bình thường do @WebSocketServer inject sau afterInit)
  Object.assign(gateway, { server: { to } });
  return { gateway, connectionQuota, emit, to };
}

function makeSocket(token?: unknown): Socket {
  return {
    handshake: { auth: token === undefined ? {} : { token } },
    data: {},
    conn: Object.assign(new EventEmitter(), { readyState: 'open' }),
    join: jest.fn(async () => undefined),
    disconnect: jest.fn(),
  } as unknown as Socket;
}

describe('SignalingGateway (unit — fanout thuần, không business logic)', () => {
  describe('authenticate — JWT lúc handshake', () => {
    it('token hợp lệ → gán userId từ payload.sub vào socket.data', async () => {
      const { gateway } = makeGateway();
      const socket = makeSocket('valid-token');
      await gateway.authenticate(socket);
      expect((socket.data as { userId?: string }).userId).toBe('user-1');
    });

    it.each([
      ['thiếu token', undefined],
      ['token rỗng', ''],
      ['token không phải string', 123],
    ])('%s → từ chối UNAUTHORIZED', async (_label, token) => {
      const { gateway } = makeGateway();
      await expect(gateway.authenticate(makeSocket(token))).rejects.toThrow(
        'UNAUTHORIZED',
      );
    });

    it('token giả/hết hạn (verify throw) → UNAUTHORIZED, không gán userId', async () => {
      const { gateway } = makeGateway(
        jest.fn(async () => {
          throw new Error('jwt expired');
        }),
      );
      const socket = makeSocket('expired');
      await expect(gateway.authenticate(socket)).rejects.toThrow(
        'UNAUTHORIZED',
      );
      expect((socket.data as { userId?: string }).userId).toBeUndefined();
    });

    it('JWT ký hợp lệ nhưng thiếu sub → UNAUTHORIZED', async () => {
      const { gateway } = makeGateway(
        jest.fn(async () => ({ isGuest: false })),
      );
      await expect(
        gateway.authenticate(makeSocket('signed-token')),
      ).rejects.toThrow('UNAUTHORIZED');
    });
  });

  describe('relay — Redis pmessage → đúng room user, payload nguyên văn', () => {
    it('channel realtime:user:{id} → emit(event, data) vào room user:{id}', () => {
      const { gateway, emit, to } = makeGateway();
      gateway.relay(
        'realtime:user:user-9',
        JSON.stringify({ event: 'soul.message', data: { sessionId: 's1' } }),
      );
      expect(to).toHaveBeenCalledWith('user:user-9');
      expect(emit).toHaveBeenCalledWith('soul.message', { sessionId: 's1' });
    });

    it('channel lạ → bỏ qua, không emit', () => {
      const { gateway, emit } = makeGateway();
      gateway.relay('khac:user:user-9', JSON.stringify({ event: 'x' }));
      expect(emit).not.toHaveBeenCalled();
    });

    it('payload không phải JSON hoặc thiếu event → bỏ qua, không crash', () => {
      const { gateway, emit } = makeGateway();
      gateway.relay('realtime:user:user-9', 'not-json{');
      gateway.relay('realtime:user:user-9', JSON.stringify({ data: 1 }));
      expect(emit).not.toHaveBeenCalled();
    });
  });

  it('ping trả pong (giữ smoke test skeleton)', () => {
    const { gateway } = makeGateway();
    expect(gateway.ping()).toEqual({ event: 'pong', data: 'pong' });
  });

  it('delegate admission/release qua Redis quota service bằng lease riêng', async () => {
    const { gateway } = makeGateway();
    const quota = (
      gateway as unknown as { connectionQuota: ConnectionQuotaService }
    ).connectionQuota;
    const admit = (
      gateway as unknown as {
        admitConnection: (socket: Socket, userId: string) => Promise<boolean>;
      }
    ).admitConnection;
    const socket = makeSocket();
    (socket.data as { userId?: string }).userId = 'user-1';

    await expect(admit.call(gateway, socket, 'user-1')).resolves.toBe(true);
    const leaseId = (socket.data as { quotaLeaseId?: string }).quotaLeaseId;
    expect(leaseId).toEqual(expect.any(String));
    expect(quota.acquire).toHaveBeenCalledWith('user-1', leaseId);

    gateway.handleConnection(socket);
    gateway.handleDisconnect(socket);
    await Promise.resolve();
    expect(quota.release).toHaveBeenCalledWith('user-1', leaseId);
  });

  it('transport đóng trong async handshake → release lease đã acquire', async () => {
    const { gateway, connectionQuota } = makeGateway();
    const socket = makeSocket();
    const admit = (
      gateway as unknown as {
        admitConnection: (socket: Socket, userId: string) => Promise<boolean>;
      }
    ).admitConnection;

    await admit.call(gateway, socket, 'user-1');
    (socket.conn as unknown as EventEmitter).emit('close');
    await Promise.resolve();

    expect(connectionQuota.release).toHaveBeenCalledWith(
      'user-1',
      expect.any(String),
    );
  });

  it('transport đóng trong lúc Redis acquire pending → release ngay khi acquire trả về', async () => {
    const { gateway, connectionQuota } = makeGateway();
    let resolveAcquire!: (value: boolean) => void;
    jest
      .mocked(connectionQuota.acquire)
      .mockReturnValueOnce(
        new Promise<boolean>((resolve) => (resolveAcquire = resolve)),
      );
    const socket = makeSocket();
    const admit = (
      gateway as unknown as {
        admitConnection: (socket: Socket, userId: string) => Promise<boolean>;
      }
    ).admitConnection;

    const pending = admit.call(gateway, socket, 'user-1');
    Object.assign(socket.conn, { readyState: 'closed' });
    (socket.conn as unknown as EventEmitter).emit('close');
    resolveAcquire(true);

    await expect(pending).rejects.toThrow('CONNECTION_QUOTA_UNAVAILABLE');
    await Promise.resolve();
    expect(connectionQuota.release).toHaveBeenCalledWith(
      'user-1',
      expect.any(String),
    );
  });

  it('Redis quota lỗi lúc acquire → fail closed với lỗi handshake rõ ràng', async () => {
    const { gateway, connectionQuota } = makeGateway();
    jest
      .mocked(connectionQuota.acquire)
      .mockRejectedValueOnce(new Error('redis unavailable'));
    const admit = (
      gateway as unknown as {
        admitConnection: (socket: Socket, userId: string) => Promise<boolean>;
      }
    ).admitConnection;

    await expect(admit.call(gateway, makeSocket(), 'user-1')).rejects.toThrow(
      'CONNECTION_QUOTA_UNAVAILABLE',
    );
  });

  it('Redis quota lỗi lúc refresh → ngắt socket để fail closed', async () => {
    jest.useFakeTimers();
    const { gateway, connectionQuota } = makeGateway();
    jest
      .mocked(connectionQuota.refresh)
      .mockRejectedValueOnce(new Error('redis unavailable'));
    const socket = makeSocket();
    const disconnect = jest.fn();
    Object.assign(socket, { disconnect });
    Object.assign(socket.data, { userId: 'user-1', quotaLeaseId: 'lease-1' });
    (
      gateway as unknown as {
        startLeaseRefresh: (socket: Socket, userId: string) => void;
      }
    ).startLeaseRefresh(socket, 'user-1');

    await jest.advanceTimersByTimeAsync(30_000);
    expect(disconnect).toHaveBeenCalledWith(true);
    gateway.handleDisconnect(socket);
    jest.useRealTimers();
  });

  it('shutdown ngắt socket trước khi release global slot', async () => {
    const { gateway, connectionQuota } = makeGateway();
    const socket = makeSocket();
    const admit = (
      gateway as unknown as {
        admitConnection: (socket: Socket, userId: string) => Promise<boolean>;
      }
    ).admitConnection;
    (socket.data as { userId?: string }).userId = 'user-1';
    await admit.call(gateway, socket, 'user-1');
    gateway.handleConnection(socket);

    await gateway.onModuleDestroy();

    const disconnect = jest.mocked(socket.disconnect);
    const release = jest.mocked(connectionQuota.release);
    expect(disconnect).toHaveBeenCalledWith(true);
    expect(release).toHaveBeenCalled();
    expect(disconnect.mock.invocationCallOrder[0]).toBeLessThan(
      release.mock.invocationCallOrder[0],
    );
  });

  it('shutdown buộc disconnect khi Redis đang reconnect và quit thất bại', async () => {
    const { gateway } = makeGateway();
    const subscriber = {
      status: 'reconnecting',
      quit: jest.fn().mockRejectedValue(new Error("Stream isn't writeable")),
      disconnect: jest.fn(),
    };
    Object.assign(gateway, { subscriber, subscriptionReady: true });

    await gateway.onModuleDestroy();

    expect(subscriber.quit).toHaveBeenCalledTimes(1);
    expect(subscriber.disconnect).toHaveBeenCalledTimes(1);
    expect(gateway.isReady()).toBe(false);
  });
});
