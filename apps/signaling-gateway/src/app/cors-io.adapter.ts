import { IoAdapter } from '@nestjs/platform-socket.io';

import type { INestApplicationContext } from '@nestjs/common';
import type { Server, ServerOptions } from 'socket.io';

/**
 * Áp allow-list runtime cho cả polling và WebSocket handshake của Socket.IO, và (tuỳ chọn)
 * gắn cluster adapter (Redis — docs/07 Giai đoạn 6) để nhiều instance gateway chia sẻ được
 * room/broadcast qua Socket.IO thay vì chỉ hoạt động đúng trong phạm vi 1 process.
 */
export class CorsIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly allowedOrigins: string[],
    private readonly clusterAdapter?: ServerOptions['adapter'],
  ) {
    super(app);
  }

  override createIOServer(
    port: number,
    options?: Partial<ServerOptions>,
  ): Server {
    return super.createIOServer(port, {
      ...options,
      cors: {
        ...options?.cors,
        origin: this.allowedOrigins.length > 0 ? this.allowedOrigins : false,
      },
      ...(this.clusterAdapter ? { adapter: this.clusterAdapter } : {}),
    }) as Server;
  }
}
