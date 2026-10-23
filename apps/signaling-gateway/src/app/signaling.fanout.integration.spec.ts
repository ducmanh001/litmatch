import { randomUUID } from 'node:crypto';

import { JwtService } from '@nestjs/jwt';
import { ExpressAdapter } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { realtimeUserChannel } from '@litmatch/common-dtos';
import Redis from 'ioredis';
import { io } from 'socket.io-client';

import { RealtimeFanout } from './realtime-fanout';

import type { ConnectionQuotaService } from './connection-quota.service';
import type { SignalingGateway } from './signaling.gateway';

import type { INestApplication } from '@nestjs/common';
import type { Socket as ClientSocket } from 'socket.io-client';

/**
 * Fanout theo user trên Redis THẬT với 2 pod gateway độc lập: pod chỉ SUBSCRIBE channel của user
 * có socket trên pod, giữ nguyên đó qua reconnect Redis, và Redis chớp không làm rớt socket đang
 * sống (docs/services/realtime-gateway.md § 5–6). Cùng công tắc INTEGRATION_DB_URL — chỉ cần Redis.
 */
const INTEGRATION_DB_URL = process.env['INTEGRATION_DB_URL'];
const d = INTEGRATION_DB_URL ? describe : describe.skip;
if (!INTEGRATION_DB_URL) {
  console.warn(
    '[signaling.fanout] BỎ QUA — set INTEGRATION_DB_URL để chạy test fanout theo user trên Redis thật',
  );
}

jest.setTimeout(60_000);

const JWT_SECRET = 'signaling-fanout-integration-secret-0123456789abcdef';
const REDIS_URL = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
const LEASE_MS = '10000'; // tối thiểu cho phép → gia hạn mỗi ~3,3 giây

interface Instance {
  app: INestApplication;
  baseUrl: string;
  gateway: SignalingGateway;
  quota: ConnectionQuotaService;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

d('Fanout theo user — 2 pod gateway độc lập (Redis thật)', () => {
  let podA: Instance;
  let podB: Instance;
  let jwt: JwtService;
  let redis: Redis;
  const openClients: ClientSocket[] = [];
  const saved: Record<string, string | undefined> = {};

  async function bootInstance(): Promise<Instance> {
    // import động SAU khi set env — AppModule validate env lúc khởi tạo
    const { AppModule } = await import('./app.module');
    const { CorsIoAdapter } = await import('./cors-io.adapter');
    const { SignalingRedisAdapterService } =
      await import('./redis-adapter.service');
    const { SignalingGateway } = await import('./signaling.gateway');
    const { ConnectionQuotaService } =
      await import('./connection-quota.service');
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const app = moduleRef.createNestApplication(new ExpressAdapter());
    const clusterAdapter = await app
      .get(SignalingRedisAdapterService)
      .connect(REDIS_URL);
    app.useWebSocketAdapter(new CorsIoAdapter(app, [], clusterAdapter));
    await app.listen(0);
    const address = app.getHttpServer().address() as { port: number };
    return {
      app,
      baseUrl: `http://127.0.0.1:${address.port}`,
      gateway: app.get(SignalingGateway),
      quota: app.get(ConnectionQuotaService),
    };
  }

  beforeAll(async () => {
    process.env['JWT_SECRET'] = JWT_SECRET;
    process.env['REDIS_URL'] = REDIS_URL;
    saved['WS_CONNECTION_LEASE_MS'] = process.env['WS_CONNECTION_LEASE_MS'];
    process.env['WS_CONNECTION_LEASE_MS'] = LEASE_MS;
    jwt = new JwtService({ secret: JWT_SECRET });
    redis = new Redis(REDIS_URL);
    [podA, podB] = await Promise.all([bootInstance(), bootInstance()]);
  });

  afterAll(async () => {
    for (const client of openClients) client.close();
    await podA?.app.close();
    await podB?.app.close();
    await redis?.quit();
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  async function connectedClient(
    pod: Instance,
    userId: string,
  ): Promise<ClientSocket> {
    const token = await jwt.signAsync({ sub: userId, isGuest: false });
    const socket = io(`${pod.baseUrl}/signaling`, {
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

  async function numSub(userId: string): Promise<number> {
    const reply = (await redis.call(
      'PUBSUB',
      'NUMSUB',
      realtimeUserChannel(userId),
    )) as [string, number];
    return Number(reply[1]);
  }

  async function waitFor(
    check: () => Promise<boolean> | boolean,
    description: string,
    timeoutMs = 10_000,
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await check()) return;
      await sleep(50);
    }
    throw new Error(`Hết thời gian chờ: ${description}`);
  }

  /**
   * Cắt connection của CHÍNH pod này (không `CLIENT KILL` trên server Redis dùng chung — các suite
   * integration khác chạy song song trên cùng Redis sẽ bị rớt connection theo). ioredis tự nối lại
   * theo retryStrategy, giống một lần Redis chớp thật.
   */
  async function dropConnection(redis: Redis): Promise<void> {
    (redis as unknown as { stream: { destroy(): void } }).stream.destroy();
    await sleep(50);
  }

  const fanoutClientOf = (pod: Instance): Redis =>
    (
      pod.gateway as unknown as {
        fanout: { shards: Array<{ redis: Redis }> };
      }
    ).fanout.shards[0].redis;

  const quotaClientOf = (pod: Instance): Redis =>
    (pod.quota as unknown as { clients: Redis[] }).clients[0];

  function collect(socket: ClientSocket, event: string): unknown[] {
    const received: unknown[] = [];
    socket.on(event, (data: unknown) => received.push(data));
    return received;
  }

  const publish = (userId: string, event: string, data: unknown) =>
    redis.publish(realtimeUserChannel(userId), JSON.stringify({ event, data }));

  it('chỉ pod giữ socket subscribe channel của user; thêm/bớt socket cùng user giữ đúng một subscription', async () => {
    const userId = `fanout-${randomUUID()}`;
    expect(await numSub(userId)).toBe(0);

    const first = await connectedClient(podA, userId);
    // Handshake chỉ hoàn tất SAU khi SUBSCRIBE được xác nhận → không cần chờ.
    expect(await numSub(userId)).toBe(1); // pod B (cũng đang chạy) KHÔNG subscribe user này

    const second = await connectedClient(podA, userId);
    expect(await numSub(userId)).toBe(1); // cùng pod → dùng chung một subscription

    first.close();
    await sleep(300);
    expect(await numSub(userId)).toBe(1); // còn socket thứ hai

    second.close();
    await waitFor(async () => (await numSub(userId)) === 0, 'UNSUBSCRIBE');
  });

  it('user chỉ có ở pod B nhận đúng 1 bản; pod A không giữ subscription nào cho user đó', async () => {
    const userId = `fanout-${randomUUID()}`;
    const client = await connectedClient(podB, userId);
    const received = collect(client, 'soul.matched');

    await publish(userId, 'soul.matched', { id: 's1' });
    await waitFor(() => received.length > 0, 'event tới client');
    await sleep(200);

    expect(received).toEqual([{ id: 's1' }]);
    expect(await numSub(userId)).toBe(1);
  });

  it('mất kết nối pub/sub → gateway tự subscribe lại đúng user, event sau đó vẫn tới', async () => {
    const userId = `fanout-${randomUUID()}`;
    const client = await connectedClient(podA, userId);
    const received = collect(client, 'friend.message');
    let disconnected = false;
    client.on('disconnect', () => (disconnected = true));

    await dropConnection(fanoutClientOf(podA));
    await waitFor(
      async () => (await numSub(userId)) === 1,
      'subscribe lại',
      15_000,
    );
    await publish(userId, 'friend.message', { messageId: 'm1' });
    await waitFor(() => received.length > 0, 'event sau khi hồi phục');

    expect(received).toEqual([{ messageId: 'm1' }]);
    expect(disconnected).toBe(false); // socket client không bị rớt vì Redis chớp
  });

  it('mất kết nối lệnh Redis KHÔNG làm rớt socket; lease vẫn được gia hạn khi Redis hồi phục', async () => {
    const userId = `fanout-${randomUUID()}`;
    const client = await connectedClient(podA, userId);
    let disconnected = false;
    client.on('disconnect', () => (disconnected = true));
    const key = `signaling:connection-quota:${userId}`;
    const scoreOf = async (): Promise<number> => {
      const [, score] = await redis.zrange(key, 0, -1, 'WITHSCORES');
      return Number(score);
    };
    const before = await scoreOf();

    await dropConnection(quotaClientOf(podA));
    await sleep(1_500);
    expect(disconnected).toBe(false);

    await waitFor(async () => (await scoreOf()) > before, 'lease được gia hạn');
    expect(disconnected).toBe(false);
  });

  it('RealtimeFanout chế độ pattern (đường lùi) vẫn giao event bằng PSUBSCRIBE và không subscribe theo user', async () => {
    // Dựng trực tiếp lớp fanout: `ConfigModule.forRoot` validate env một lần lúc AppModule được
    // import nên không thể bật WS_FANOUT_MODE khác cho một pod thứ ba trong cùng process test.
    const received: Array<[string, string]> = [];
    const legacy = new RealtimeFanout({
      urls: [REDIS_URL],
      mode: 'pattern',
      onEvent: (channel, raw) => received.push([channel, raw]),
      logger: { warn: () => undefined, error: () => undefined },
    });
    try {
      const userId = `fanout-${randomUUID()}`;
      await waitFor(() => legacy.isReady(), 'PSUBSCRIBE sẵn sàng');
      await legacy.subscribeUser(userId); // no-op ở chế độ pattern

      expect(await numSub(userId)).toBe(0);
      await publish(userId, 'soul.ended', { sessionId: 's1' });
      await waitFor(() => received.length > 0, 'event qua PSUBSCRIBE');

      expect(received[0][0]).toBe(realtimeUserChannel(userId));
    } finally {
      await legacy.close();
    }
  });
});
