import { Logger, OnModuleDestroy } from '@nestjs/common';
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
import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';

import { ConnectionQuotaService } from './connection-quota.service';
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

const CONNECTION_LIMIT_ERROR = 'CONNECTION_LIMIT';
const CONNECTION_QUOTA_UNAVAILABLE_ERROR = 'CONNECTION_QUOTA_UNAVAILABLE';

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
    OnModuleDestroy
{
  private readonly logger = new Logger(SignalingGateway.name);
  /** Connection Redis RIÊNG cho subscribe — ioredis ở chế độ subscriber không dùng được lệnh khác. */
  private subscriber?: Redis;
  private subscriptionReady = false;
  private subscriptionInFlight?: Promise<void>;
  private readonly activeQuotaLeases = new Map<
    string,
    { userId: string; timer: NodeJS.Timeout; client: Socket }
  >();
  private stopQuotaUnavailableListener?: () => void;
  private shuttingDown = false;

  @WebSocketServer()
  private readonly server!: Namespace;

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService<SignalingEnv, true>,
    private readonly connectionQuota: ConnectionQuotaService,
  ) {}

  afterInit(server: Namespace): void {
    this.stopQuotaUnavailableListener = this.connectionQuota.onUnavailable(() =>
      this.disconnectActiveQuotaSockets(),
    );
    // Middleware handshake: connection KHÔNG token hợp lệ bị từ chối trước khi thành socket
    server.use((socket, next) => {
      if (this.shuttingDown) {
        next(new Error(CONNECTION_QUOTA_UNAVAILABLE_ERROR));
        return;
      }
      void this.authenticate(socket)
        .then(async () => {
          const userId = (socket.data as { userId?: string }).userId;
          if (!userId) throw new Error(RealtimeConnectionErrors.Unauthorized);
          if (!(await this.admitConnection(socket, userId))) {
            throw new Error(CONNECTION_LIMIT_ERROR);
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

  async onModuleDestroy(): Promise<void> {
    this.shuttingDown = true;
    this.subscriptionReady = false;
    this.stopQuotaUnavailableListener?.();
    this.stopQuotaUnavailableListener = undefined;
    const leases = [...this.activeQuotaLeases.entries()];
    this.activeQuotaLeases.clear();
    await Promise.allSettled(
      leases.map(([leaseId, { userId, timer, client }]) => {
        clearInterval(timer);
        // Stop the transport before freeing its global slot. Nest disposes Socket.IO only after
        // module-destroy hooks, so release-first would temporarily admit >3 across replicas.
        client.disconnect(true);
        return this.connectionQuota.release(userId, leaseId);
      }),
    );
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
    return (
      this.subscriber?.status === 'ready' &&
      this.subscriptionReady &&
      this.connectionQuota.isReady()
    );
  }

  handleConnection(client: Socket): void {
    const data = client.data as {
      userId?: string;
      quotaPreconnectCleanup?: () => void;
    };
    const userId = data.userId;
    if (!userId) {
      // middleware đã chặn — tới đây là bug, ngắt để không có socket "vô danh" nhận event
      client.disconnect(true);
      return;
    }
    if (data.quotaPreconnectCleanup) {
      client.conn.off('close', data.quotaPreconnectCleanup);
      data.quotaPreconnectCleanup = undefined;
    }
    this.startLeaseRefresh(client, userId);
    void client.join(userRoom(userId));
    this.logger.debug(`User ${userId} connected: ${client.id}`);
  }

  handleDisconnect(client: Socket): void {
    const data = client.data as {
      userId?: string;
      quotaLeaseId?: string;
      quotaRefreshTimer?: NodeJS.Timeout;
    };
    if (data.quotaRefreshTimer) {
      clearInterval(data.quotaRefreshTimer);
      data.quotaRefreshTimer = undefined;
    }
    if (data.quotaLeaseId && data.userId) {
      const leaseId = data.quotaLeaseId;
      this.activeQuotaLeases.delete(leaseId);
      data.quotaLeaseId = undefined;
      void this.connectionQuota.release(data.userId, leaseId).catch((error) => {
        // Fail-safe: lease có TTL nên replica crash/Redis outage không giữ slot vĩnh viễn.
        this.logger.warn(
          `Không thể release connection quota: ${String(error)}`,
        );
        captureSentryException(error, 'signaling-connection-quota-release');
      });
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

  private async admitConnection(
    client: Socket,
    userId: string,
  ): Promise<boolean> {
    const leaseId = randomUUID();
    const data = client.data as {
      quotaLeaseId?: string;
      quotaPreconnectCleanup?: () => void;
    };
    let transportClosed = client.conn.readyState === 'closed';
    const cleanup = () => {
      transportClosed = true;
      if (data.quotaLeaseId !== leaseId) return;
      data.quotaLeaseId = undefined;
      void this.connectionQuota.release(userId, leaseId).catch(() => {
        // Bounded lease expires if the transport and Redis disappear together.
      });
    };
    client.conn.once('close', cleanup);

    let admitted: boolean;
    try {
      admitted = await this.connectionQuota.acquire(userId, leaseId);
    } catch (error) {
      client.conn.off('close', cleanup);
      void this.connectionQuota.release(userId, leaseId).catch(() => {
        // The acquire may have executed server-side before its response timed out. TTL remains
        // the final safety net when Redis is too unavailable for this best-effort cleanup.
      });
      captureSentryException(error, 'signaling-connection-quota');
      throw new Error(CONNECTION_QUOTA_UNAVAILABLE_ERROR, { cause: error });
    }
    if (!admitted) {
      client.conn.off('close', cleanup);
      return false;
    }
    data.quotaLeaseId = leaseId;
    data.quotaPreconnectCleanup = cleanup;
    if (
      transportClosed ||
      client.conn.readyState === 'closed' ||
      this.shuttingDown
    ) {
      cleanup();
      throw new Error(CONNECTION_QUOTA_UNAVAILABLE_ERROR);
    }
    return true;
  }

  private startLeaseRefresh(client: Socket, userId: string): void {
    const data = client.data as {
      quotaLeaseId?: string;
      quotaRefreshTimer?: NodeJS.Timeout;
    };
    const leaseId = data.quotaLeaseId;
    if (!leaseId) {
      client.disconnect(true);
      return;
    }
    const timer = setInterval(
      () => {
        void this.connectionQuota
          .refresh(userId, leaseId)
          .then((refreshed) => {
            if (!refreshed) client.disconnect(true);
          })
          .catch((error) => {
            // Fail closed: khi không thể chứng minh lease còn hợp lệ, ngắt socket.
            captureSentryException(error, 'signaling-connection-quota-refresh');
            client.disconnect(true);
          });
      },
      Math.floor(this.connectionQuota.leaseMs / 3),
    );
    timer.unref();
    data.quotaRefreshTimer = timer;
    this.activeQuotaLeases.set(leaseId, { userId, timer, client });
  }

  private disconnectActiveQuotaSockets(): void {
    for (const { timer, client } of this.activeQuotaLeases.values()) {
      clearInterval(timer);
      client.disconnect(true);
    }
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
