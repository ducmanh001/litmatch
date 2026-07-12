import { JwtService } from '@nestjs/jwt';
import { ExpressAdapter } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { RealtimeEvents, realtimeUserChannel } from '@litmatch/common-dtos';
import Redis from 'ioredis';
import { io } from 'socket.io-client';

import type { INestApplication } from '@nestjs/common';
import type { RealtimeEnvelope } from '@litmatch/common-dtos';
import type { Socket as ClientSocket } from 'socket.io-client';

/**
 * Integration test tầng fanout trên Socket.IO + Redis THẬT (docs/services/realtime-gateway.md):
 * connect có/không JWT, event chỉ tới đúng user, payload relay nguyên văn.
 * Gate cùng công tắc INTEGRATION_DB_URL như các suite integration khác của repo
 * (hạ tầng test thật có sẵn) — bản thân suite chỉ cần Redis, không cần Postgres.
 */
const INTEGRATION_DB_URL = process.env['INTEGRATION_DB_URL'];
const d = INTEGRATION_DB_URL ? describe : describe.skip;
if (!INTEGRATION_DB_URL) {
  console.warn(
    '[signaling.integration] BỎ QUA — set INTEGRATION_DB_URL để chạy test fanout trên Redis thật',
  );
}

jest.setTimeout(30_000);

const JWT_SECRET = 'signaling-integration-secret-0123456789abcdef';
const REDIS_URL = process.env['REDIS_URL'] ?? 'redis://localhost:6379';

d('SignalingGateway integration (Socket.IO + Redis thật)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let redis: Redis;
  let jwt: JwtService;
  const openClients: ClientSocket[] = [];

  beforeAll(async () => {
    process.env['JWT_SECRET'] = JWT_SECRET;
    process.env['REDIS_URL'] = REDIS_URL;
    // import động SAU khi set env — AppModule validate env lúc khởi tạo
    const { AppModule } = await import('./app.module');
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    // Adapter truyền tường minh — @nestjs/testing (pnpm isolation) không tự require được platform-express
    app = moduleRef.createNestApplication(new ExpressAdapter());
    await app.listen(0);
    const address = app.getHttpServer().address() as { port: number };
    baseUrl = `http://127.0.0.1:${address.port}`;

    redis = new Redis(REDIS_URL);
    jwt = new JwtService({ secret: JWT_SECRET });

    // chờ gateway PSUBSCRIBE xong — publish trước khi subscriber sẵn sàng sẽ rơi vào hư không
    const deadline = Date.now() + 5000;
    while (Number(await redis.call('PUBSUB', 'NUMPAT')) < 1) {
      if (Date.now() > deadline)
        throw new Error('Gateway chưa PSUBSCRIBE sau 5s');
      await new Promise((r) => setTimeout(r, 50));
    }
  });

  afterAll(async () => {
    for (const c of openClients) c.close();
    await redis?.quit();
    await app?.close();
  });

  function connect(token?: string): ClientSocket {
    const socket = io(`${baseUrl}/signaling`, {
      auth: token ? { token } : {},
      transports: ['websocket'],
      reconnection: false,
    });
    openClients.push(socket);
    return socket;
  }

  /** Connect + đợi handshake xong + ping/pong (đảm bảo server đã join room user). */
  async function connectedClient(userId: string): Promise<ClientSocket> {
    const token = await jwt.signAsync({ sub: userId, isGuest: false });
    const socket = connect(token);
    await new Promise<void>((resolve, reject) => {
      socket.on('connect', resolve);
      socket.on('connect_error', reject);
    });
    await new Promise<void>((resolve) => {
      socket.emit('ping');
      socket.on('pong', () => resolve());
    });
    return socket;
  }

  it('không token / token giả → connection bị từ chối UNAUTHORIZED', async () => {
    const noToken = connect();
    const errNoToken = await new Promise<Error>((resolve) =>
      noToken.on('connect_error', resolve),
    );
    expect(errNoToken.message).toBe('UNAUTHORIZED');

    const fake = connect('khong-phai-jwt');
    const errFake = await new Promise<Error>((resolve) =>
      fake.on('connect_error', resolve),
    );
    expect(errFake.message).toBe('UNAUTHORIZED');
  });

  it('event chỉ tới ĐÚNG user — publish cho A thì B không nhận; payload relay nguyên văn', async () => {
    const [clientA, clientB] = await Promise.all([
      connectedClient('user-a'),
      connectedClient('user-b'),
    ]);

    const receivedA: unknown[] = [];
    const receivedB: unknown[] = [];
    clientA.on(RealtimeEvents.SoulMessage, (data) => receivedA.push(data));
    clientB.on(RealtimeEvents.SoulMessage, (data) => receivedB.push(data));

    const envelope: RealtimeEnvelope = {
      event: RealtimeEvents.SoulMessage,
      data: {
        sessionId: 's1',
        messageId: 'm1',
        senderRole: 'partner',
        content: 'xin chào',
        sentAt: '2026-07-12T00:00:00.000Z',
      },
    };
    await redis.publish(
      realtimeUserChannel('user-a'),
      JSON.stringify(envelope),
    );

    // chờ A nhận (tối đa 3s), B tuyệt đối không nhận
    const deadline = Date.now() + 3000;
    while (receivedA.length === 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 25));
    }
    expect(receivedA).toEqual([envelope.data]);
    await new Promise((r) => setTimeout(r, 200)); // cửa sổ để chắc B không nhận trễ
    expect(receivedB).toEqual([]);
  });

  it('payload rác trên channel realtime không làm gateway chết — event sau vẫn tới', async () => {
    const client = await connectedClient('user-c');
    const received: unknown[] = [];
    client.on(RealtimeEvents.MatchMatched, (data) => received.push(data));

    await redis.publish(realtimeUserChannel('user-c'), 'not-json{');
    const envelope: RealtimeEnvelope = {
      event: RealtimeEvents.MatchMatched,
      data: { ticketId: 't1', sessionId: 's1' },
    };
    await redis.publish(
      realtimeUserChannel('user-c'),
      JSON.stringify(envelope),
    );

    const deadline = Date.now() + 3000;
    while (received.length === 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 25));
    }
    expect(received).toEqual([envelope.data]);
  });
});
