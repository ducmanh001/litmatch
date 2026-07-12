import { IoAdapter } from '@nestjs/platform-socket.io';

import type { INestApplicationContext } from '@nestjs/common';
import type { Server, ServerOptions } from 'socket.io';

/** Áp allow-list runtime cho cả polling và WebSocket handshake của Socket.IO. */
export class CorsIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly allowedOrigins: string[],
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
    }) as Server;
  }
}
