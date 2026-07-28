import { Logger, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import {
  RealtimeConnectionErrors,
  REALTIME_USER_CHANNEL_PATTERN,
  parseRealtimeUserChannel,
} from '@litmatch/common-dtos';
import { captureSentryException } from '@litmatch/observability';
import Redis from 'ioredis';

import type { Namespace, Socket } from 'socket.io';
import type {
  AccessTokenPayload,
  RealtimeEnvelope,
} from '@litmatch/common-dtos';
import type { SignalingEnv } from '../config/env.validation';

/** Room Socket.IO theo user — client được join TỰ ĐỘNG từ JWT đã verify, không join theo yêu cầu. */
function userRoom(userId: string): string {
  return `user:${userId}`;
}

/** Một tab lỗi/reconnect không được nhân socket vô hạn cho cùng một user. */
const MAX_CONNECTIONS_PER_USER = 3;

/**
 * Tầng fanout realtime (docs/services/realtime-gateway.md, docs/03 § 3.3): gateway KHÔNG chứa
 * business logic — authz/membership/ẩn danh do core-api quyết TẠI THỜI ĐIỂM PUBLISH vào channel
 * `realtime:user:{userId}`; gateway chỉ (1) verify JWT lúc handshake, (2) join socket vào room
 * user CỦA CHÍNH NÓ (không nhận room từ client), (3) relay envelope Redis → socket nguyên văn.
 * Signaling điều khiển LiveKit (join call, ACK) thuộc mục roadmap SFU — chưa ở slice này.
 */
@WebSocketGateway({ namespace: '/signaling' })
export class SignalingGateway
  implements
    OnGatewayInit,
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnApplicationShutdown
{
  private readonly logger = new Logger(SignalingGateway.name);
  /** Connection Redis RIÊNG cho subscribe — ioredis ở chế độ subscriber không dùng được lệnh khác. */
  private subscriber?: Redis;
  private subscriptionReady = false;
  private subscriptionInFlight?: Promise<void>;
  private readonly connectionsByUser = new Map<string, number>();

  @WebSocketServer()
  private readonly server!: Namespace;

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService<SignalingEnv, true>,
  ) {}

  afterInit(server: Namespace): void {
    // Middleware handshake: connection KHÔNG token hợp lệ bị từ chối trước khi thành socket
    server.use((socket, next) => {
      void this.authenticate(socket)
        .then(() => {
          const userId = (socket.data as { userId?: string }).userId;
          if (!userId || !this.admitConnection(socket, userId)) {
            throw new Error('CONNECTION_LIMIT');
          }
          next();
        })
        .catch((err: Error) => next(err));
    });

    this.subscriber = new Redis(
      this.config.getOrThrow('REDIS_URL', { infer: true }),
      {
        connectTimeout: 1_000,
        commandTimeout: 1_000,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        retryStrategy: (attempt) => Math.min(attempt * 100, 1_000),
      },
    );
    this.subscriber.on('ready', () => this.ensureSubscribed());
    this.subscriber.on('close', () => {
      this.subscriptionReady = false;
    });
    this.subscriber.on('end', () => {
      this.subscriptionReady = false;
    });
    this.subscriber.on('pmessage', (_pattern, channel, raw) =>
      this.relay(channel, raw),
    );
    this.ensureSubscribed();
  }

  async onApplicationShutdown(): Promise<void> {
    this.subscriptionReady = false;
    this.connectionsByUser.clear();
    const subscriber = this.subscriber;
    this.subscriber = undefined;
    if (!subscriber) return;

    try {
      await subscriber.quit();
    } catch {
      // `quit()` không gửi được khi Redis đang reconnect (offline queue đã tắt). Đóng cưỡng bức
      // để retry timer/socket không giữ process sống sau shutdown.
      subscriber.disconnect();
    }
  }

  /** Readiness thật: Redis đã kết nối VÀ pattern fanout đã subscribe thành công. */
  isReady(): boolean {
    return this.subscriber?.status === 'ready' && this.subscriptionReady;
  }

  handleConnection(client: Socket): void {
    const userId = (client.data as { userId?: string }).userId;
    if (!userId) {
      // middleware đã chặn — tới đây là bug, ngắt để không có socket "vô danh" nhận event
      client.disconnect(true);
      return;
    }
    void client.join(userRoom(userId));
    this.logger.debug(`User ${userId} connected: ${client.id}`);
  }

  handleDisconnect(client: Socket): void {
    const data = client.data as {
      userId?: string;
      connectionAdmitted?: boolean;
    };
    if (data.connectionAdmitted && data.userId) {
      const current = this.connectionsByUser.get(data.userId) ?? 0;
      if (current <= 1) this.connectionsByUser.delete(data.userId);
      else this.connectionsByUser.set(data.userId, current - 1);
      data.connectionAdmitted = false;
    }
    this.logger.debug(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('ping')
  ping(): { event: string; data: string } {
    return { event: 'pong', data: 'pong' };
  }

  /** Verify JWT từ `handshake.auth.token` — gán userId vào socket.data (public để unit test). */
  async authenticate(client: Socket): Promise<void> {
    const token = (client.handshake.auth as { token?: unknown }).token;
    if (typeof token !== 'string' || token === '') {
      throw new Error(RealtimeConnectionErrors.Unauthorized);
    }
    try {
      const payload =
        await this.jwtService.verifyAsync<AccessTokenPayload>(token);
      if (typeof payload.sub !== 'string' || payload.sub === '') {
        throw new Error('missing sub');
      }
      (client.data as { userId?: string }).userId = payload.sub;
    } catch {
      throw new Error(RealtimeConnectionErrors.Unauthorized);
    }
  }

  private admitConnection(client: Socket, userId: string): boolean {
    const current = this.connectionsByUser.get(userId) ?? 0;
    if (current >= MAX_CONNECTIONS_PER_USER) return false;
    this.connectionsByUser.set(userId, current + 1);
    (client.data as { connectionAdmitted?: boolean }).connectionAdmitted = true;
    return true;
  }

  /** Relay Redis → socket room của đúng user; payload không đọc/sửa (public để unit test). */
  relay(channel: string, raw: string): void {
    const userId = parseRealtimeUserChannel(channel);
    if (!userId) return; // channel lạ — bỏ qua
    let envelope: RealtimeEnvelope;
    try {
      envelope = JSON.parse(raw) as RealtimeEnvelope;
    } catch {
      this.logger.warn(`Bỏ qua payload không phải JSON trên ${channel}`);
      return;
    }
    if (typeof envelope?.event !== 'string') return;
    this.server.to(userRoom(userId)).emit(envelope.event, envelope.data);
  }

  private ensureSubscribed(): void {
    if (!this.subscriber || this.subscriptionInFlight) return;
    this.subscriptionReady = false;
    this.subscriptionInFlight = this.subscriber
      .psubscribe(REALTIME_USER_CHANNEL_PATTERN)
      .then(() => {
        this.subscriptionReady = true;
      })
      .catch((err: unknown) => {
        this.logger.error(`PSUBSCRIBE thất bại: ${String(err)}`);
        captureSentryException(err, 'signaling-redis-subscription');
      })
      .finally(() => {
        this.subscriptionInFlight = undefined;
      });
  }
}
