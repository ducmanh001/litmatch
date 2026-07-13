import { JwtService } from '@nestjs/jwt';
import { ExpressAdapter } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
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
  const openClients: ClientSocket[] = [];

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
    jwt = new JwtService({ secret: JWT_SECRET });

    [instanceA, instanceB] = await Promise.all([
      bootInstance(),
      bootInstance(),
    ]);
  });

  afterAll(async () => {
    for (const c of openClients) c.close();
    await instanceA?.app.close();
    await instanceB?.app.close();
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
});
