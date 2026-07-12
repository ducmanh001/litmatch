import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';

import type { Socket } from 'socket.io';

/**
 * Skeleton Giai đoạn 0 — logic signaling thật (join room Voice Match, điều khiển
 * Media Server có ACK) thuộc Giai đoạn 2 (docs/07-roadmap.md).
 * Gateway KHÔNG chứa business logic (docs/03 § 3.3) — mọi quyết định hỏi core-api.
 */
@WebSocketGateway({ namespace: '/signaling', cors: false })
export class SignalingGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(SignalingGateway.name);

  handleConnection(client: Socket): void {
    this.logger.debug(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket): void {
    this.logger.debug(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('ping')
  ping(): { event: string; data: string } {
    return { event: 'pong', data: 'pong' };
  }
}
