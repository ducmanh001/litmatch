import { JwtService } from '@nestjs/jwt';
import { ExpressAdapter } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import Redis from 'ioredis';
import { io } from 'socket.io-client';

import type { INestApplication } from '@nestjs/common';
import type { Socket as ClientSocket } from 'socket.io-client';
import type { SignalingGateway } from './signaling.gateway';

/**
 * Chứng minh horizontal scale THẬT (docs/07 Giai đoạn 6, docs/04 § Realtime signaling):
 * 2 process gateway RIÊNG BIỆT (2 app instance, không chia sẻ bộ nhớ) cùng gắn Redis cluster
 * adapter cho Socket.IO. `server.to(room).emit()` gọi ở instance B phải tới được socket đang
 * giữ kết nối ở instance A — điều KHÔNG thể xảy ra nếu chỉ chạy Socket.IO adapter in-memory
 * mặc định (room chỉ tồn tại trong phạm vi process tạo ra nó).
 *
 * Khác với `signaling.integration.spec.ts` (test đường relay Redis PSUBSCRIBE riêng của gateway,
 * vốn đã cross-instance từ trước) — suite này test cơ chế CLUSTER ADAPTER của chính Socket.IO.
 * Cùng công tắc INTEGRATION_DB_URL — suite chỉ cần Redis thật.
 */
const INTEGRATION_DB_URL = process.env['INTEGRATION_DB_URL'];
const d = INTEGRATION_DB_URL ? describe : describe.skip;
if (!INTEGRATION_DB_URL) {
  console.warn(
    '[signaling.horizontal-scale] BỎ QUA — set INTEGRATION_DB_URL để chạy test cluster adapter trên Redis thật',
  );
}

jest.setTimeout(30_000);

const JWT_SECRET = 'signaling-scale-integration-secret-0123456789abcdef';
const REDIS_URL = process.env['REDIS_URL'] ?? 'redis://localhost:6379';

interface Instance {
  app: INestApplication;
  baseUrl: string;
}

d('Socket.IO cluster adapter — 2 instance gateway độc lập (Redis thật)', () => {
  let instanceA: Instance;
  let instanceB: Instance;
  let jwt: JwtService;
  let quotaRedis: Redis;
  const openClients: ClientSocket[] = [];
  const previousLeaseMs = process.env['WS_CONNECTION_LEASE_MS'];

  async function bootInstance(): Promise<Instance> {
    // import động SAU khi set env — AppModule validate env lúc khởi tạo
    const { AppModule } = await import('./app.module');
    const { CorsIoAdapter } = await import('./cors-io.adapter');
    const { SignalingRedisAdapterService } =
      await import('./redis-adapter.service');

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const app = moduleRef.createNestApplication(new ExpressAdapter());

    const redisAdapter = app.get(SignalingRedisAdapterService);
    const clusterAdapter = await redisAdapter.connect(REDIS_URL);
    app.useWebSocketAdapter(new CorsIoAdapter(app, [], clusterAdapter));

    await app.listen(0);
    const address = app.getHttpServer().address() as { port: number };
    return { app, baseUrl: `http://127.0.0.1:${address.port}` };
  }

  beforeAll(async () => {
    process.env['JWT_SECRET'] = JWT_SECRET;
    process.env['REDIS_URL'] = REDIS_URL;
    process.env['WS_CONNECTION_LEASE_MS'] = '10000';
    jwt = new JwtService({ secret: JWT_SECRET });
    quotaRedis = new Redis(REDIS_URL);

    [instanceA, instanceB] = await Promise.all([
      bootInstance(),
      bootInstance(),
    ]);
  });

  afterAll(async () => {
    for (const c of openClients) c.close();
    await instanceA?.app.close();
    await instanceB?.app.close();
    await quotaRedis?.quit();
    if (previousLeaseMs === undefined) {
      delete process.env['WS_CONNECTION_LEASE_MS'];
    } else {
      process.env['WS_CONNECTION_LEASE_MS'] = previousLeaseMs;
    }
  });

  async function connectedClient(
    instance: Instance,
    userId: string,
  ): Promise<ClientSocket> {
    const token = await jwt.signAsync({ sub: userId, isGuest: false });
    const socket = io(`${instance.baseUrl}/signaling`, {
      auth: { token },
      transports: ['websocket'],
      reconnection: false,
    });
    openClients.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.on('connect', resolve);
      socket.on('connect_error', reject);
    });
    return socket;
  }

  async function rejectedClient(
    instance: Instance,
    userId: string,
  ): Promise<Error> {
    const token = await jwt.signAsync({ sub: userId, isGuest: false });
    const socket = io(`${instance.baseUrl}/signaling`, {
      auth: { token },
      transports: ['websocket'],
      reconnection: false,
    });
    openClients.push(socket);
    return new Promise((resolve, reject) => {
      socket.on('connect', () =>
        reject(new Error('Expected connection rejection')),
      );
      socket.on('connect_error', resolve);
    });
  }

  async function waitForQuotaCount(
    userId: string,
    expected: number,
    timeoutMs = 5_000,
  ): Promise<void> {
    const key = `signaling:connection-quota:${userId}`;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if ((await quotaRedis.zcard(key)) === expected) return;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(
      `Timed out waiting for Redis quota count ${expected} for ${userId}`,
    );
  }

  it('emit từ instance B tới được socket chỉ connect ở instance A (cluster adapter thật)', async () => {
    const clientOnA = await connectedClient(instanceA, 'cross-instance-user');

    const received: unknown[] = [];
    clientOnA.on('cluster.ping', (data) => received.push(data));

    // Gọi thẳng Namespace server của INSTANCE B — không qua relay PSUBSCRIBE của gateway,
    // chỉ để chứng minh chính cơ chế broadcast của Socket.IO (server.to().emit()) xuyên process
    // nhờ adapter Redis. Truy cập field private `server` bằng runtime reflection (chấp nhận
    // trong test, giống cách unit test hiện có của repo mock field này).
    const { SignalingGateway } = await import('./signaling.gateway');
    const gatewayOnB = instanceB.app.get<SignalingGateway>(SignalingGateway);
    const namespaceOnB = (
      gatewayOnB as unknown as {
        server: { to: (room: string) => { emit: (...a: unknown[]) => void } };
      }
    ).server;
    namespaceOnB.to('user:cross-instance-user').emit('cluster.ping', {
      from: 'instance-b',
    });

    const deadline = Date.now() + 5000;
    while (received.length === 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 25));
    }
    expect(received).toEqual([{ from: 'instance-b' }]);
  });

  it('quota per-user atomic xuyên 2 instance và trả slot sau disconnect/reconnect', async () => {
    const userId = `quota-${Date.now()}`;
    const first = await connectedClient(instanceA, userId);
    await connectedClient(instanceB, userId);
    await connectedClient(instanceA, userId);

    const rejected = await rejectedClient(instanceB, userId);
    expect(rejected.message).toBe('CONNECTION_LIMIT');

    const serverSawDisconnect = new Promise<void>((resolve) => {
      first.on('disconnect', () => resolve());
    });
    first.disconnect();
    await serverSawDisconnect;
    await waitForQuotaCount(userId, 2);

    const reconnected = await connectedClient(instanceB, userId);
    expect(reconnected.connected).toBe(true);
  });

  it('chỉ 3 admission thắng khi 8 kết nối tranh quota đồng thời trên 2 instance', async () => {
    const userId = `quota-race-${Date.now()}`;
    const results = await Promise.all(
      Array.from({ length: 8 }, async (_, index) => {
        try {
          return await connectedClient(
            index % 2 === 0 ? instanceA : instanceB,
            userId,
          );
        } catch (error) {
          return error;
        }
      }),
    );
    expect(
      results.filter(
        (result) =>
          typeof result === 'object' &&
          result !== null &&
          'connected' in result &&
          result.connected,
      ),
    ).toHaveLength(3);
    expect(
      results.filter(
        (result) =>
          result instanceof Error && result.message === 'CONNECTION_LIMIT',
      ),
    ).toHaveLength(5);
  });

  it('stale release không xoá lease reconnect và acquire dọn member hết hạn', async () => {
    const { ConnectionQuotaService } =
      await import('./connection-quota.service');
    const quota = instanceA.app.get(ConnectionQuotaService);
    const userId = `quota-lease-${Date.now()}`;
    const key = `signaling:connection-quota:${userId}`;

    await quota.acquire(userId, 'old');
    const leaseTtl = await quotaRedis.pttl(key);
    expect(leaseTtl).toBeGreaterThan(0);
    expect(leaseTtl).toBeLessThanOrEqual(quota.leaseMs);
    await quota.acquire(userId, 'other-1');
    await quota.acquire(userId, 'other-2');
    await quota.release(userId, 'old');
    await expect(quota.acquire(userId, 'new')).resolves.toBe(true);
    await quota.release(userId, 'old');
    await expect(quota.acquire(userId, 'over-limit')).resolves.toBe(false);

    await quotaRedis.zadd(key, 0, 'other-1');
    await expect(quota.acquire(userId, 'after-expiry')).resolves.toBe(true);
    await quotaRedis.del(key);
  });

  it('socket sống được renew qua TTL, còn lease của replica chết tự hết hạn', async () => {
    const { ConnectionQuotaService } =
      await import('./connection-quota.service');
    const quota = instanceA.app.get(ConnectionQuotaService);
    const liveUserId = `quota-live-${Date.now()}`;
    const orphanUserId = `quota-orphan-${Date.now()}`;
    const live = await connectedClient(instanceA, liveUserId);

    await quota.acquire(orphanUserId, 'orphan-1');
    await quota.acquire(orphanUserId, 'orphan-2');
    await quota.acquire(orphanUserId, 'orphan-3');

    // Không release/refresh các lease orphan: tương đương replica chết đột ngột.
    await waitForQuotaCount(orphanUserId, 0, 15_000);

    expect(live.connected).toBe(true);
    await waitForQuotaCount(liveUserId, 1);
    expect(
      await quotaRedis.zcard(`signaling:connection-quota:${liveUserId}`),
    ).toBe(1);
    await expect(quota.acquire(orphanUserId, 'after-crash')).resolves.toBe(
      true,
    );
    live.disconnect();
    await quotaRedis.del(`signaling:connection-quota:${orphanUserId}`);
  });
});
