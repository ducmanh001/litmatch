import { randomUUID } from 'node:crypto';

import { JwtService } from '@nestjs/jwt';
import { ExpressAdapter } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { realtimeShardIndex, realtimeUserChannel } from '@litmatch/common-dtos';
import Redis from 'ioredis';
import { io } from 'socket.io-client';

import type { INestApplication } from '@nestjs/common';
import type { Socket as ClientSocket } from 'socket.io-client';

/**
 * Chia shard Redis theo userId trên HAI Redis server THẬT, KHÁC NHAU: quota/presence và
 * subscribe của một user chỉ nằm ở shard của user đó; event publish đúng shard thì tới, publish
 * nhầm shard thì không (chứng minh routing đi theo cùng hàm hash với core-api).
 *
 * Cần hai server riêng nên dùng biến riêng:
 *   INTEGRATION_REDIS_SHARD_URLS=redis://127.0.0.1:6379,redis://127.0.0.1:6380
 * Không đặt → suite bị bỏ qua (CI chỉ có một Redis).
 */
const SHARD_URLS = (process.env['INTEGRATION_REDIS_SHARD_URLS'] ?? '')
  .split(',')
  .map((url) => url.trim())
  .filter(Boolean);
const d = SHARD_URLS.length >= 2 ? describe : describe.skip;
if (SHARD_URLS.length < 2) {
  console.warn(
    '[signaling.sharded] BỎ QUA — set INTEGRATION_REDIS_SHARD_URLS=<redis1>,<redis2> (hai server khác nhau)',
  );
}

jest.setTimeout(60_000);

const JWT_SECRET = 'signaling-sharded-integration-secret-0123456789abcdef';
const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

d('Mặt phẳng realtime chia shard theo userId (2 Redis thật)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let jwt: JwtService;
  let shards: Redis[];
  const openClients: ClientSocket[] = [];
  const shardCount = SHARD_URLS.length;

  /** userId (UUID) thuộc đúng shard `shard`. */
  function userOnShard(shard: number): string {
    for (;;) {
      const candidate = randomUUID();
      if (realtimeShardIndex(candidate, shardCount) === shard) return candidate;
    }
  }

  beforeAll(async () => {
    process.env['JWT_SECRET'] = JWT_SECRET;
    process.env['REDIS_URL'] = SHARD_URLS[0];
    process.env['REALTIME_REDIS_URLS'] = SHARD_URLS.join(',');
    // import động SAU khi set env — AppModule validate env lúc khởi tạo
    const { AppModule } = await import('./app.module');
    const { CorsIoAdapter } = await import('./cors-io.adapter');
    const { SignalingRedisAdapterService } =
      await import('./redis-adapter.service');
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication(new ExpressAdapter());
    const clusterAdapter = await app
      .get(SignalingRedisAdapterService)
      .connect(SHARD_URLS[0]);
    app.useWebSocketAdapter(new CorsIoAdapter(app, [], clusterAdapter));
    await app.listen(0);
    baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}`;
    jwt = new JwtService({ secret: JWT_SECRET });
    shards = SHARD_URLS.map((url) => new Redis(url));
  });

  afterAll(async () => {
    for (const client of openClients) client.close();
    await app?.close();
    await Promise.all((shards ?? []).map((redis) => redis.quit()));
    delete process.env['REALTIME_REDIS_URLS'];
  });

  async function connectedClient(userId: string): Promise<ClientSocket> {
    const token = await jwt.signAsync({ sub: userId, isGuest: false });
    const socket = io(`${baseUrl}/signaling`, {
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

  async function numSub(shard: number, userId: string): Promise<number> {
    const reply = (await shards[shard].call(
      'PUBSUB',
      'NUMSUB',
      realtimeUserChannel(userId),
    )) as [string, number];
    return Number(reply[1]);
  }

  const publishTo = (
    shard: number,
    userId: string,
    event: string,
    data: unknown,
  ) =>
    shards[shard].publish(
      realtimeUserChannel(userId),
      JSON.stringify({ event, data }),
    );

  it('quota, presence và subscribe của mỗi user chỉ nằm ở shard của user đó', async () => {
    for (let shard = 0; shard < shardCount; shard += 1) {
      const userId = userOnShard(shard);
      await connectedClient(userId);

      for (let other = 0; other < shardCount; other += 1) {
        const expected = other === shard ? 1 : 0;
        expect(
          await shards[other].zcard(`signaling:connection-quota:${userId}`),
        ).toBe(expected);
        expect(await shards[other].zcard(`realtime:presence:${userId}`)).toBe(
          expected,
        );
        expect(await numSub(other, userId)).toBe(expected);
      }
    }
  });

  it('event publish đúng shard của user thì tới; publish nhầm shard thì không', async () => {
    const userId = userOnShard(1);
    const client = await connectedClient(userId);
    const received: unknown[] = [];
    client.on('friend.message', (data: unknown) => received.push(data));

    await publishTo(0, userId, 'friend.message', { messageId: 'sai-shard' });
    await sleep(300);
    expect(received).toEqual([]); // shard 0 không phải chỗ gateway subscribe user này

    await publishTo(1, userId, 'friend.message', { messageId: 'dung-shard' });
    const deadline = Date.now() + 3_000;
    while (received.length === 0 && Date.now() < deadline) await sleep(25);
    expect(received).toEqual([{ messageId: 'dung-shard' }]);
  });

  it('trần 3 socket/user vẫn đúng khi lease nằm ở shard riêng của user', async () => {
    const userId = userOnShard(shardCount - 1);
    await connectedClient(userId);
    await connectedClient(userId);
    await connectedClient(userId);

    const token = await jwt.signAsync({ sub: userId, isGuest: false });
    const fourth = io(`${baseUrl}/signaling`, {
      auth: { token },
      transports: ['websocket'],
      reconnection: false,
    });
    openClients.push(fourth);
    const error = await new Promise<Error>((resolve) =>
      fourth.on('connect_error', resolve),
    );

    expect(error.message).toBe('CONNECTION_LIMIT');
    expect(
      await shards[shardCount - 1].zcard(
        `signaling:connection-quota:${userId}`,
      ),
    ).toBe(3);
  });
});
