import { EventEmitter } from 'node:events';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { createAdapter } from '@socket.io/redis-adapter';
import { Server } from 'socket.io';
import { io as connect } from 'socket.io-client';

import { SignalingGateway } from './signaling.gateway';

import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import type { Socket as ClientSocket } from 'socket.io-client';

import type { SignalingEnv } from '../config/env.validation';
import type { ConnectionQuotaService } from './connection-quota.service';

/**
 * Regression: mỗi pod gateway PSUBSCRIBE `realtime:user:*` nên MỌI pod đều gọi `relay()` cho cùng
 * một event. Nếu relay dùng `server.to(room).emit()` thường, Redis cluster adapter còn chuyển tiếp
 * broadcast đó sang các pod khác → socket nhận N bản (N = số pod). Relay phải chỉ emit cho room
 * CỤC BỘ (`server.local`).
 *
 * Test chạy mã thật của `@socket.io/redis-adapter` trên một bus pub/sub giả trong process, nên
 * không cần Redis; suite integration với Redis thật nằm ở `signaling.horizontal-scale.integration.spec.ts`.
 */

/** Tập con ioredis mà adapter dùng (nhánh không phải node-redis v4): publish/psubscribe/subscribe. */
class FakeRedisBus {
  readonly clients = new Set<FakeRedis>();
}

class FakeRedis extends EventEmitter {
  private readonly patterns: string[] = [];
  private readonly channels = new Set<string>();

  constructor(private readonly bus: FakeRedisBus) {
    super();
    bus.clients.add(this);
  }

  psubscribe(pattern: string): Promise<void> {
    this.patterns.push(pattern);
    return Promise.resolve();
  }

  subscribe(channels: string | string[]): Promise<void> {
    for (const channel of Array.isArray(channels) ? channels : [channels]) {
      this.channels.add(channel);
    }
    return Promise.resolve();
  }

  publish(channel: string, message: Buffer): Promise<number> {
    for (const client of this.bus.clients) {
      // giao bất đồng bộ như Redis thật — không chạy handler trong call stack của publisher
      setImmediate(() => client.deliver(channel, message));
    }
    return Promise.resolve(this.bus.clients.size);
  }

  private deliver(channel: string, message: Buffer): void {
    for (const pattern of this.patterns) {
      if (channel.startsWith(pattern.slice(0, -1))) {
        this.emit(
          'pmessageBuffer',
          Buffer.from(pattern),
          Buffer.from(channel),
          message,
        );
      }
    }
    if (this.channels.has(channel)) {
      this.emit('messageBuffer', Buffer.from(channel), message);
    }
  }
}

interface Instance {
  gateway: SignalingGateway;
  close: () => Promise<void>;
  url: string;
}

async function bootInstance(bus: FakeRedisBus): Promise<Instance> {
  const httpServer = createServer();
  const adapter = createAdapter(
    new FakeRedis(bus) as never,
    new FakeRedis(bus) as never,
  );
  const server = new Server(httpServer, { adapter });
  const namespace = server.of('/signaling');
  namespace.on('connection', (socket) => {
    void socket.join('user:user-1');
  });

  const gateway = new SignalingGateway(
    { verifyAsync: jest.fn() } as unknown as JwtService,
    {
      getOrThrow: () => 'redis://localhost:6379',
      get: () => undefined,
    } as unknown as ConfigService<SignalingEnv, true>,
    {} as unknown as ConnectionQuotaService,
  );
  // bình thường @WebSocketServer inject namespace sau afterInit()
  Object.assign(gateway, { server: namespace });

  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const { port } = httpServer.address() as AddressInfo;
  return {
    gateway,
    url: `http://127.0.0.1:${port}/signaling`,
    close: async () => {
      await server.close();
    },
  };
}

function waitConnected(socket: ClientSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
}

const settle = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

describe('SignalingGateway.relay — nhiều pod cùng PSUBSCRIBE (Redis cluster adapter)', () => {
  const instances: Instance[] = [];
  const clients: ClientSocket[] = [];

  afterEach(async () => {
    for (const client of clients.splice(0)) client.disconnect();
    for (const instance of instances.splice(0)) await instance.close();
  });

  it('mỗi socket nhận đúng 1 bản dù cả 2 pod cùng relay một event', async () => {
    const bus = new FakeRedisBus();
    const podA = await bootInstance(bus);
    const podB = await bootInstance(bus);
    instances.push(podA, podB);

    const client = connect(podA.url, { transports: ['websocket'] });
    clients.push(client);
    await waitConnected(client);
    const received: unknown[] = [];
    client.on('friend.message', (data: unknown) => received.push(data));

    // Redis PSUBSCRIBE giao cùng một message cho CẢ HAI pod
    const raw = JSON.stringify({
      event: 'friend.message',
      data: { messageId: 'm1' },
    });
    podA.gateway.relay('realtime:user:user-1', raw);
    podB.gateway.relay('realtime:user:user-1', raw);
    await settle(300);

    expect(received).toEqual([{ messageId: 'm1' }]);
  });

  it('user chỉ có socket ở pod B vẫn nhận 1 bản từ relay của chính pod B', async () => {
    const bus = new FakeRedisBus();
    const podA = await bootInstance(bus);
    const podB = await bootInstance(bus);
    instances.push(podA, podB);

    const client = connect(podB.url, { transports: ['websocket'] });
    clients.push(client);
    await waitConnected(client);
    const received: unknown[] = [];
    client.on('soul.matched', (data: unknown) => received.push(data));

    const raw = JSON.stringify({ event: 'soul.matched', data: { id: 's1' } });
    podA.gateway.relay('realtime:user:user-1', raw);
    podB.gateway.relay('realtime:user:user-1', raw);
    await settle(300);

    expect(received).toEqual([{ id: 's1' }]);
  });
});
