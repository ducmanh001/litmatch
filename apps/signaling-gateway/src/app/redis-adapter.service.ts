import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';

import type { ServerOptions } from 'socket.io';

/**
 * Socket.IO cluster adapter (docs/07 Giai đoạn 6 — horizontal scale, docs/04 § Realtime signaling).
 * 2 kết nối Redis RIÊNG cho pub/sub nội bộ của thư viện — KHÔNG dùng chung với connection
 * PSUBSCRIBE `realtime:user:*` của SignalingGateway (cùng nguyên tắc "1 connection riêng cho
 * subscribe", docs/services/realtime-gateway.md § 5). Nhờ adapter này, `server.to(room).emit()`
 * gọi ở 1 instance vẫn tới được socket đang giữ ở instance KHÁC trong cụm.
 */
@Injectable()
export class SignalingRedisAdapterService implements OnApplicationShutdown {
  private readonly logger = new Logger(SignalingRedisAdapterService.name);
  private pubClient?: Redis;
  private subClient?: Redis;

  async connect(
    redisUrl: string,
  ): Promise<NonNullable<ServerOptions['adapter']>> {
    this.pubClient = new Redis(redisUrl);
    this.subClient = this.pubClient.duplicate();
    // Listener bền vững — không có listener 'error' thì ioredis ném exception làm crash process
    // mỗi lần reconnect drop giữa chừng (khác với race connect ban đầu bên dưới).
    this.pubClient.on('error', (err) =>
      this.logger.warn(`Redis adapter pubClient lỗi: ${String(err)}`),
    );
    this.subClient.on('error', (err) =>
      this.logger.warn(`Redis adapter subClient lỗi: ${String(err)}`),
    );

    await Promise.all([
      this.waitReady(this.pubClient),
      this.waitReady(this.subClient),
    ]);
    return createAdapter(this.pubClient, this.subClient);
  }

  /** Cả 2 client đã sẵn sàng — dùng cho readiness probe (docs/services/realtime-gateway.md). */
  isReady(): boolean {
    return (
      this.pubClient?.status === 'ready' && this.subClient?.status === 'ready'
    );
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.all([
      this.pubClient?.quit().catch(() => undefined),
      this.subClient?.quit().catch(() => undefined),
    ]);
  }

  private waitReady(client: Redis): Promise<void> {
    if (client.status === 'ready') return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      client.once('ready', resolve);
      client.once('error', reject);
    });
  }
}
