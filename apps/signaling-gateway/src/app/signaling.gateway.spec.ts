import { EventEmitter } from 'node:events';

import { JwtService as RealJwtService } from '@nestjs/jwt';
import { metrics } from '@opentelemetry/api';

import { SignalingGateway } from './signaling.gateway';
import { SignalingMetrics } from './signaling.metrics';

import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import type { Socket } from 'socket.io';

import type { SignalingEnv } from '../config/env.validation';
import type { ConnectionQuotaService } from './connection-quota.service';

interface FakeFanout {
  subscribeUser: jest.Mock;
  releaseUser: jest.Mock;
  isReady: jest.Mock;
  isShardReady: jest.Mock;
  beginClose: jest.Mock;
  close: jest.Mock;
  shardCount: number;
  subscribedUsers: number;
}

interface FakeRefresher {
  add: jest.Mock;
  remove: jest.Mock;
  stop: jest.Mock;
  size: number;
}

function makeGateway(
  verifyImpl?: jest.Mock,
  previousSecret = '',
  overrides: Partial<SignalingEnv> = {},
): {
  gateway: SignalingGateway;
  connectionQuota: ConnectionQuotaService;
  fanout: FakeFanout;
  refresher: FakeRefresher;
  signalingMetrics: SignalingMetrics;
  emit: jest.Mock;
  to: jest.Mock;
  rooms: Map<string, Set<string>>;
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
    get: (key: string) =>
      key === 'JWT_SECRET_PREVIOUS'
        ? previousSecret
        : overrides[key as keyof SignalingEnv],
  } as unknown as ConfigService<SignalingEnv, true>;
  const connectionQuota = {
    leaseMs: 90_000,
    maxConnections: 3,
    shardCount: 1,
    isReady: jest.fn(() => true),
    isShardReady: jest.fn(() => true),
    acquire: jest.fn(async () => true),
    release: jest.fn(async () => undefined),
    releaseMany: jest.fn(async () => undefined),
  } as unknown as ConnectionQuotaService;
  const signalingMetrics = new SignalingMetrics(metrics.getMeter('test'));
  jest.spyOn(signalingMetrics, 'relay');
  jest.spyOn(signalingMetrics, 'connectionOpened');
  jest.spyOn(signalingMetrics, 'connectionClosed');
  const gateway = new SignalingGateway(
    jwtService,
    config,
    connectionQuota,
    signalingMetrics,
  );
  const emit = jest.fn();
  const to = jest.fn(() => ({ emit }));
  const rooms = new Map<string, Set<string>>();
  const fanout: FakeFanout = {
    subscribeUser: jest.fn(async () => undefined),
    releaseUser: jest.fn(),
    isReady: jest.fn(() => true),
    isShardReady: jest.fn(() => true),
    beginClose: jest.fn(),
    close: jest.fn(async () => undefined),
    shardCount: 1,
    subscribedUsers: 0,
  };
  const refresher: FakeRefresher = {
    add: jest.fn(),
    remove: jest.fn(),
    stop: jest.fn(),
    size: 0,
  };
  // gán server mock (bình thường do @WebSocketServer inject sau afterInit). Relay chỉ được đi qua
  // `server.local` — mock không có `server.to` để một lần quay lại emit toàn cụm sẽ fail ngay.
  Object.assign(gateway, {
    server: {
      name: '/signaling',
      sockets: new Map([['socket-1', makeSocket()]]),
      local: { to },
      adapter: { rooms },
    },
    fanout,
    refresher,
  });
  return {
    gateway,
    connectionQuota,
    fanout,
    refresher,
    signalingMetrics,
    emit,
    to,
    rooms,
  };
}

function makeSocket(token?: unknown): Socket {
  return {
    handshake: { auth: token === undefined ? {} : { token } },
    data: {},
    conn: Object.assign(new EventEmitter(), {
      readyState: 'open',
      close: jest.fn(),
    }),
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

  describe('authenticate — xoay khoá JWT_SECRET', () => {
    const CURRENT = 'current-secret-0123456789abcdef0123456789abcdef';
    const PREVIOUS = 'previous-secret-0123456789abcdef0123456789abcde';
    const realJwt = new RealJwtService({ secret: CURRENT });
    const verifyReal = (): jest.Mock =>
      jest.fn((token: string, options?: object) =>
        realJwt.verifyAsync(token, options),
      );
    const tokenSignedBy = (secret: string): Promise<string> =>
      new RealJwtService({ secret }).signAsync(
        { sub: 'user-7', isGuest: false },
        { expiresIn: '5m' },
      );

    it('token ký bằng khoá hiện tại → hợp lệ', async () => {
      const { gateway } = makeGateway(verifyReal(), PREVIOUS);
      const socket = makeSocket(await tokenSignedBy(CURRENT));
      await gateway.authenticate(socket);
      expect((socket.data as { userId?: string }).userId).toBe('user-7');
    });

    it('token ký bằng khoá cũ → hợp lệ khi có JWT_SECRET_PREVIOUS', async () => {
      const { gateway } = makeGateway(verifyReal(), PREVIOUS);
      const socket = makeSocket(await tokenSignedBy(PREVIOUS));
      await gateway.authenticate(socket);
      expect((socket.data as { userId?: string }).userId).toBe('user-7');
    });

    it('token ký bằng khoá cũ → UNAUTHORIZED khi không có JWT_SECRET_PREVIOUS', async () => {
      const { gateway } = makeGateway(verifyReal());
      await expect(
        gateway.authenticate(makeSocket(await tokenSignedBy(PREVIOUS))),
      ).rejects.toThrow('UNAUTHORIZED');
    });
  });

  describe('relay — Redis message → đúng room user, payload nguyên văn', () => {
    it('channel realtime:user:{id} → emit(event, data) vào room user:{id} CỦA POD NÀY (server.local)', () => {
      const { gateway, emit, to, rooms } = makeGateway();
      rooms.set('user:user-9', new Set(['socket-1']));
      gateway.relay(
        'realtime:user:user-9',
        JSON.stringify({ event: 'soul.message', data: { sessionId: 's1' } }),
      );
      expect(to).toHaveBeenCalledWith('socket-1');
      expect(emit).toHaveBeenCalledWith('soul.message', { sessionId: 's1' });
    });

    it('user không có socket nào trên pod → bỏ qua TRƯỚC khi parse JSON', () => {
      const { gateway, emit, to, signalingMetrics } = makeGateway();
      const parse = jest.spyOn(JSON, 'parse');
      try {
        gateway.relay(
          'realtime:user:user-9',
          JSON.stringify({ event: 'soul.message', data: {} }),
        );
        expect(parse).not.toHaveBeenCalled();
      } finally {
        parse.mockRestore();
      }
      expect(to).not.toHaveBeenCalled();
      expect(emit).not.toHaveBeenCalled();
      expect(signalingMetrics.relay).toHaveBeenCalledWith('no_local_room');
    });

    it('channel lạ → bỏ qua, không emit', () => {
      const { gateway, emit } = makeGateway();
      gateway.relay('khac:user:user-9', JSON.stringify({ event: 'x' }));
      expect(emit).not.toHaveBeenCalled();
    });

    it('payload không phải JSON hoặc thiếu event → bỏ qua, không crash', () => {
      const { gateway, emit, rooms, signalingMetrics } = makeGateway();
      rooms.set('user:user-9', new Set(['socket-1']));
      gateway.relay('realtime:user:user-9', 'not-json{');
      gateway.relay('realtime:user:user-9', JSON.stringify({ data: 1 }));
      expect(emit).not.toHaveBeenCalled();
      expect(signalingMetrics.relay).toHaveBeenCalledWith('invalid');
    });
  });

  it('ping trả pong (giữ smoke test skeleton)', () => {
    const { gateway } = makeGateway();
    expect(gateway.ping()).toEqual({ event: 'pong', data: 'pong' });
  });

  describe('process admission capacity', () => {
    it('includes connected sockets and returns capacity exactly once on disconnect', async () => {
      const { gateway } = makeGateway(undefined, '', {
        WS_MAX_CONNECTIONS_PER_PROCESS: 1,
      });
      const first = makeSocket('t');
      await gateway.admit(first);
      gateway.handleConnection(first);
      await expect(gateway.admit(makeSocket('t'))).rejects.toThrow(
        'CONNECTION_QUOTA_UNAVAILABLE',
      );
      gateway.handleDisconnect(first);
      gateway.handleDisconnect(first);
      await expect(gateway.admit(makeSocket('t'))).resolves.toBeUndefined();
      await expect(gateway.admit(makeSocket('t'))).rejects.toThrow(
        'CONNECTION_QUOTA_UNAVAILABLE',
      );
    });

    it('bounds asynchronous JWT work even after the pending transport closes', async () => {
      let confirm!: (value: { sub: string }) => void;
      const verify = jest
        .fn()
        .mockReturnValueOnce(
          new Promise<{ sub: string }>((resolve) => {
            confirm = resolve;
          }),
        )
        .mockResolvedValue({ sub: 'user-1' });
      const { gateway, connectionQuota } = makeGateway(verify, '', {
        WS_MAX_CONCURRENT_HANDSHAKES: 1,
      });
      const first = makeSocket('t');
      const pending = gateway.admit(first);
      const rejected = expect(pending).rejects.toThrow(
        'CONNECTION_QUOTA_UNAVAILABLE',
      );
      (first.conn as unknown as EventEmitter).emit('close');
      await expect(gateway.admit(makeSocket('t'))).rejects.toThrow(
        'CONNECTION_QUOTA_UNAVAILABLE',
      );
      expect(verify).toHaveBeenCalledTimes(1);
      confirm({ sub: 'user-1' });
      await rejected;
      expect(connectionQuota.acquire).not.toHaveBeenCalled();
      await expect(gateway.admit(makeSocket('t'))).resolves.toBeUndefined();
    });

    it.each(['quota', 'fanout'])(
      'keeps asynchronous capacity while a closed transport awaits %s',
      async (stage) => {
        const { gateway, connectionQuota, fanout } = makeGateway(
          undefined,
          '',
          {
            WS_MAX_CONCURRENT_HANDSHAKES: 1,
          },
        );
        let confirm!: () => void;
        const waiting = new Promise<void>((resolve) => {
          confirm = resolve;
        });
        if (stage === 'quota') {
          jest
            .mocked(connectionQuota.acquire)
            .mockReturnValueOnce(waiting.then(() => true));
        } else {
          fanout.subscribeUser.mockReturnValueOnce(waiting);
        }
        const first = makeSocket('t');
        const pending = gateway.admit(first);
        const rejected = expect(pending).rejects.toThrow(
          'CONNECTION_QUOTA_UNAVAILABLE',
        );
        await new Promise((resolve) => setImmediate(resolve));
        Object.assign(first.conn, { readyState: 'closed' });
        (first.conn as unknown as EventEmitter).emit('close');
        await expect(gateway.admit(makeSocket('t'))).rejects.toThrow(
          'CONNECTION_QUOTA_UNAVAILABLE',
        );
        confirm();
        await rejected;
        await expect(gateway.admit(makeSocket('t'))).resolves.toBeUndefined();
      },
    );

    it.each(['jwt', 'quota', 'fanout'])(
      'returns capacity after %s rejection',
      async (stage) => {
        const verify = jest.fn().mockResolvedValue({ sub: 'user-1' });
        const { gateway, connectionQuota, fanout } = makeGateway(verify, '', {
          WS_MAX_CONNECTIONS_PER_PROCESS: 1,
          WS_MAX_CONCURRENT_HANDSHAKES: 1,
        });
        if (stage === 'jwt')
          verify.mockRejectedValueOnce(new Error('bad token'));
        if (stage === 'quota') {
          jest.mocked(connectionQuota.acquire).mockResolvedValueOnce(false);
        }
        if (stage === 'fanout') {
          fanout.subscribeUser.mockRejectedValueOnce(new Error('timeout'));
        }
        await expect(gateway.admit(makeSocket('t'))).rejects.toThrow();
        await expect(gateway.admit(makeSocket('t'))).resolves.toBeUndefined();
      },
    );

    it('closes pending sockets on shutdown and rejects late authentication completion', async () => {
      let confirm!: (value: { sub: string }) => void;
      const verify = jest.fn(
        () =>
          new Promise<{ sub: string }>((resolve) => {
            confirm = resolve;
          }),
      );
      const { gateway, connectionQuota } = makeGateway(verify);
      const socket = makeSocket('t');
      const pending = gateway.admit(socket);
      const rejected = expect(pending).rejects.toThrow(
        'CONNECTION_QUOTA_UNAVAILABLE',
      );
      await gateway.onModuleDestroy();
      expect(socket.conn.close).toHaveBeenCalledWith(true);
      confirm({ sub: 'user-1' });
      await rejected;
      expect(connectionQuota.acquire).not.toHaveBeenCalled();
    });
  });

  describe('handshake — JWT → quota lease → subscribe Redis', () => {
    it('thứ tự đúng: acquire lease TRƯỚC subscribe, cả hai cho đúng userId', async () => {
      const { gateway, connectionQuota, fanout } = makeGateway();
      const socket = makeSocket('valid-token');

      await gateway.admit(socket);

      const leaseId = (socket.data as { quotaLeaseId?: string }).quotaLeaseId;
      expect(leaseId).toEqual(expect.any(String));
      expect(connectionQuota.acquire).toHaveBeenCalledWith('user-1', leaseId);
      expect(fanout.subscribeUser).toHaveBeenCalledWith('user-1');
      expect(
        jest.mocked(connectionQuota.acquire).mock.invocationCallOrder[0],
      ).toBeLessThan(fanout.subscribeUser.mock.invocationCallOrder[0]);
    });

    it('quota đã đầy → CONNECTION_LIMIT và không subscribe Redis', async () => {
      const { gateway, connectionQuota, fanout } = makeGateway();
      jest.mocked(connectionQuota.acquire).mockResolvedValueOnce(false);

      await expect(gateway.admit(makeSocket('t'))).rejects.toThrow(
        'CONNECTION_LIMIT',
      );

      expect(fanout.subscribeUser).not.toHaveBeenCalled();
    });

    it('subscribe thất bại → từ chối handshake, trả lease ngay và hoàn tác đếm subscribe một lần', async () => {
      const { gateway, connectionQuota, fanout } = makeGateway();
      fanout.subscribeUser.mockRejectedValueOnce(new Error('timeout'));
      const socket = makeSocket('t');

      await expect(gateway.admit(socket)).rejects.toThrow(
        'CONNECTION_QUOTA_UNAVAILABLE',
      );
      await Promise.resolve();

      expect(connectionQuota.release).toHaveBeenCalledWith(
        'user-1',
        expect.any(String),
      );
      expect(fanout.releaseUser).toHaveBeenCalledTimes(1);
      // Transport đóng sau đó không được trả lease/đếm lần hai.
      (socket.conn as unknown as EventEmitter).emit('close');
      await Promise.resolve();
      expect(connectionQuota.release).toHaveBeenCalledTimes(1);
      expect(fanout.releaseUser).toHaveBeenCalledTimes(1);
    });

    it('transport đóng trong lúc subscribe đang chờ → trả lease + subscribe đúng một lần, handshake bị từ chối', async () => {
      const { gateway, connectionQuota, fanout } = makeGateway();
      let confirm!: () => void;
      fanout.subscribeUser.mockReturnValueOnce(
        new Promise<void>((resolve) => (confirm = resolve)),
      );
      const socket = makeSocket('t');

      const pending = gateway.admit(socket);
      await new Promise((resolve) => setImmediate(resolve));
      Object.assign(socket.conn, { readyState: 'closed' });
      (socket.conn as unknown as EventEmitter).emit('close');
      confirm();

      await expect(pending).rejects.toThrow('CONNECTION_QUOTA_UNAVAILABLE');
      await Promise.resolve();
      expect(fanout.releaseUser).toHaveBeenCalledTimes(1);
      expect(connectionQuota.release).toHaveBeenCalledTimes(1);
    });

    it('Redis quota lỗi lúc acquire → fail closed với lỗi handshake rõ ràng', async () => {
      const { gateway, connectionQuota, fanout } = makeGateway();
      jest
        .mocked(connectionQuota.acquire)
        .mockRejectedValueOnce(new Error('redis unavailable'));

      await expect(gateway.admit(makeSocket('t'))).rejects.toThrow(
        'CONNECTION_QUOTA_UNAVAILABLE',
      );
      expect(fanout.subscribeUser).not.toHaveBeenCalled();
    });

    it('đang shutdown → từ chối handshake mới', async () => {
      const { gateway } = makeGateway();
      await gateway.onModuleDestroy();

      await expect(gateway.admit(makeSocket('t'))).rejects.toThrow(
        'CONNECTION_QUOTA_UNAVAILABLE',
      );
    });
  });

  describe('vòng đời socket', () => {
    it('connect: đăng ký lease với refresher, join room user, đếm kết nối', async () => {
      const { gateway, refresher, signalingMetrics } = makeGateway();
      const socket = makeSocket('t');
      await gateway.admit(socket);

      gateway.handleConnection(socket);

      const leaseId = (socket.data as { quotaLeaseId?: string }).quotaLeaseId;
      expect(refresher.add).toHaveBeenCalledWith(
        leaseId,
        'user-1',
        expect.any(Function),
      );
      expect(socket.join).toHaveBeenCalledWith('user:user-1');
      expect(signalingMetrics.connectionOpened).toHaveBeenCalledTimes(1);
      // Lease hết hạn không gia hạn được → refresher gọi callback này để ngắt socket.
      refresher.add.mock.calls[0][2]();
      expect(socket.conn.close).toHaveBeenCalledWith(true);
    });

    it('disconnect: gỡ lease khỏi refresher, release quota và subscribe đúng một lần', async () => {
      const { gateway, connectionQuota, fanout, refresher, signalingMetrics } =
        makeGateway();
      const socket = makeSocket('t');
      await gateway.admit(socket);
      gateway.handleConnection(socket);
      const leaseId = (socket.data as { quotaLeaseId?: string }).quotaLeaseId;

      gateway.handleDisconnect(socket);
      gateway.handleDisconnect(socket); // Socket.IO có thể báo trùng — không được trả đôi
      await Promise.resolve();

      expect(refresher.remove).toHaveBeenCalledWith(leaseId);
      expect(connectionQuota.release).toHaveBeenCalledTimes(1);
      expect(connectionQuota.release).toHaveBeenCalledWith('user-1', leaseId);
      expect(fanout.releaseUser).toHaveBeenCalledTimes(1);
      expect(signalingMetrics.connectionClosed).toHaveBeenCalledTimes(1);
    });

    it('connect rồi transport đóng thì listener tiền-kết-nối đã được gỡ (không trả trùng)', async () => {
      const { gateway, connectionQuota, fanout } = makeGateway();
      const socket = makeSocket('t');
      await gateway.admit(socket);
      gateway.handleConnection(socket);

      (socket.conn as unknown as EventEmitter).emit('close');
      await Promise.resolve();

      expect(connectionQuota.release).not.toHaveBeenCalled();
      expect(fanout.releaseUser).not.toHaveBeenCalled();
    });

    it('shutdown ngắt socket trước khi release global slot, release theo lô, đóng fanout', async () => {
      const { gateway, connectionQuota, fanout, refresher } = makeGateway();
      const socket = makeSocket('t');
      await gateway.admit(socket);
      gateway.handleConnection(socket);
      const leaseId = (socket.data as { quotaLeaseId?: string }).quotaLeaseId;
      // Disconnect thật sẽ kích hoạt handleDisconnect — nó không được release lẻ khi shutdown.
      jest.mocked(socket.conn.close).mockImplementation(() => {
        gateway.handleDisconnect(socket);
        return socket.conn;
      });

      await gateway.onModuleDestroy();

      const disconnect = jest.mocked(socket.conn.close);
      const releaseMany = jest.mocked(connectionQuota.releaseMany);
      expect(refresher.stop).toHaveBeenCalled();
      expect(disconnect).toHaveBeenCalledWith(true);
      expect(releaseMany).toHaveBeenCalledWith([{ userId: 'user-1', leaseId }]);
      expect(connectionQuota.release).not.toHaveBeenCalled();
      expect(disconnect.mock.invocationCallOrder[0]).toBeLessThan(
        releaseMany.mock.invocationCallOrder[0],
      );
      expect(fanout.close).toHaveBeenCalledTimes(1);
      // beginClose TRƯỚC khi ngắt socket: socket rời lúc shutdown không kéo theo UNSUBSCRIBE từng user.
      expect(fanout.beginClose.mock.invocationCallOrder[0]).toBeLessThan(
        disconnect.mock.invocationCallOrder[0],
      );
    });
  });

  describe('readiness — một shard hỏng không làm cả gateway NotReady', () => {
    function withShards(
      fanoutReady: boolean[],
      quotaReady: boolean[],
    ): ReturnType<typeof makeGateway> {
      const made = makeGateway();
      Object.assign(made.fanout, { shardCount: fanoutReady.length });
      Object.assign(made.connectionQuota, { shardCount: quotaReady.length });
      made.fanout.isShardReady.mockImplementation(
        (index: number) => fanoutReady[index],
      );
      jest
        .mocked(made.connectionQuota.isShardReady)
        .mockImplementation((index: number) => quotaReady[index]);
      return made;
    }

    it('một shard Redis (cấu hình mặc định) sẵn sàng → ready', () => {
      const { gateway } = makeGateway();
      expect(gateway.isReady()).toBe(true);
      expect(gateway.shardStatus()).toEqual({ serving: 1, total: 1 });
    });

    it('một shard Redis và nó hỏng → không ready', () => {
      const { gateway, fanout } = makeGateway();
      fanout.isShardReady.mockReturnValue(false);
      expect(gateway.isReady()).toBe(false);
    });

    it('còn ít nhất một shard phục vụ được thì vẫn ready; trạng thái suy giảm được báo', () => {
      const { gateway } = withShards([false, true, false], [true, true, true]);
      expect(gateway.isReady()).toBe(true);
      expect(gateway.shardStatus()).toEqual({ serving: 1, total: 3 });
    });

    it('một shard chỉ tính là phục vụ được khi CẢ lease lẫn fanout của nó đều sẵn sàng', () => {
      const { gateway } = withShards([true, false], [false, true]);
      expect(gateway.shardStatus()).toEqual({ serving: 0, total: 2 });
      expect(gateway.isReady()).toBe(false);
    });

    it('mọi shard hỏng → không ready', () => {
      const { gateway } = withShards([false, false], [false, false]);
      expect(gateway.isReady()).toBe(false);
    });

    it('chưa dựng fanout (trước afterInit) → không ready', () => {
      const { gateway } = makeGateway();
      Object.assign(gateway, { fanout: undefined });
      expect(gateway.isReady()).toBe(false);
      expect(gateway.shardStatus()).toEqual({ serving: 0, total: 1 });
    });

    it('không sẵn sàng sau khi bắt đầu shutdown (pod rút khỏi load balancer)', async () => {
      const { gateway } = makeGateway();
      await gateway.onModuleDestroy();
      expect(gateway.isReady()).toBe(false);
    });
  });
});
