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
  parseRealtimeRedisUrls,
  parseRealtimeUserChannel,
} from '@litmatch/common-dtos';
import { captureSentryException } from '@litmatch/observability';
import { randomUUID } from 'node:crypto';

import { ConnectionQuotaService } from './connection-quota.service';
import { verifyJwtWithRotation } from './jwt-rotation';
import { LeaseRefresher } from './lease-refresher';
import { RealtimeFanout } from './realtime-fanout';
import { SignalingMetrics } from './signaling.metrics';
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

interface SocketData {
  userId?: string;
  quotaLeaseId?: string;
  quotaPreconnectCleanup?: () => void;
  fanoutUserId?: string;
  fanoutPreconnectCleanup?: () => void;
  connectionCounted?: boolean;
}

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
  /** Subscribe Redis theo shard — dựng ở `afterInit` (cần config + server đã có). */
  private fanout?: RealtimeFanout;
  /** Một timer gia hạn lease cho mọi socket của pod. */
  private refresher?: LeaseRefresher;
  private readonly activeLeases = new Map<
    string,
    { userId: string; client: Socket }
  >();
  private shuttingDown = false;

  @WebSocketServer()
  private readonly server!: Namespace;

  /** Khoá cũ trong cửa sổ xoay `JWT_SECRET`; undefined khi không xoay. */
  private readonly previousJwtSecret: string | undefined;

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService<SignalingEnv, true>,
    private readonly connectionQuota: ConnectionQuotaService,
    private readonly metrics: SignalingMetrics,
  ) {
    this.previousJwtSecret =
      config.get('JWT_SECRET_PREVIOUS', { infer: true }) || undefined;
  }

  afterInit(server: Namespace): void {
    // Middleware handshake: connection KHÔNG token hợp lệ bị từ chối trước khi thành socket.
    // Thứ tự: JWT → quota lease → subscribe Redis. Subscribe xong mới báo `connect`, nên mọi event
    // publish sau khi client thấy `connect` đều tới được pod này.
    server.use((socket, next) => {
      this.admit(socket).then(
        () => next(),
        (error: Error) => next(error),
      );
    });

    this.fanout = new RealtimeFanout({
      urls: parseRealtimeRedisUrls(
        this.config.get('REALTIME_REDIS_URLS', { infer: true }),
        this.config.getOrThrow('REDIS_URL', { infer: true }),
      ),
      mode: this.config.get('WS_FANOUT_MODE', { infer: true }) ?? 'user',
      onEvent: (channel, raw) => this.relay(channel, raw),
      logger: this.logger,
      onError: captureSentryException,
    });

    const leaseMs = this.connectionQuota.leaseMs;
    const configuredRefreshMs =
      this.config.get('WS_CONNECTION_LEASE_REFRESH_MS', { infer: true }) ?? 0;
    // Gia hạn nhiều hơn một nửa lease thì chỉ còn một cơ hội thử lại trước khi hết hạn.
    const maxRefreshMs = Math.floor(leaseMs / 2);
    if (configuredRefreshMs > maxRefreshMs) {
      this.logger.warn(
        `WS_CONNECTION_LEASE_REFRESH_MS=${configuredRefreshMs} vượt một nửa WS_CONNECTION_LEASE_MS; dùng ${maxRefreshMs}`,
      );
    }
    this.refresher = new LeaseRefresher({
      quota: this.connectionQuota,
      leaseMs,
      refreshMs:
        configuredRefreshMs > 0
          ? Math.min(configuredRefreshMs, maxRefreshMs)
          : Math.floor(leaseMs / 3),
      onOutcomes: (outcome, count) => this.metrics.leaseRefresh(outcome, count),
      onError: (error) => {
        this.logger.warn(
          `Gia hạn lease gặp lỗi không lường trước: ${String(error)}`,
        );
        captureSentryException(error, 'signaling-lease-refresher');
      },
    });
    this.refresher.start();
    this.metrics.bindGauges({
      fanoutUsers: () => this.fanout?.subscribedUsers ?? 0,
      trackedLeases: () => this.refresher?.size ?? 0,
      shardsReady: () => this.shardStatus().serving,
      shardsTotal: () => this.connectionQuota.shardCount,
    });
  }

  async onModuleDestroy(): Promise<void> {
    this.shuttingDown = true;
    this.refresher?.stop();
    // Trước khi ngắt socket: mỗi socket rời sẽ không còn kéo theo một lệnh UNSUBSCRIBE riêng.
    this.fanout?.beginClose();
    const leases = [...this.activeLeases.entries()];
    this.activeLeases.clear();
    // Stop the transport before freeing its global slot. Nest disposes Socket.IO only after
    // module-destroy hooks, so release-first would temporarily admit >3 across replicas.
    for (const [, { client }] of leases) client.disconnect(true);
    await this.connectionQuota.releaseMany(
      leases.map(([leaseId, { userId }]) => ({ userId, leaseId })),
    );
    const fanout = this.fanout;
    this.fanout = undefined;
    await fanout?.close();
  }

  /**
   * Readiness thật: ít nhất MỘT shard Redis phục vụ được (lease đã kết nối VÀ subscription mong muốn
   * đã có hiệu lực). Một shard hỏng chỉ làm user của shard đó fail closed lúc handshake (`admit`); nếu
   * pod bị rút khỏi load balancer vì một shard thì CẢ gateway ngừng phục vụ, kể cả user ở các shard
   * còn lại, và nhiều pod mới cũng không khởi động nổi để gánh tải. Mức suy giảm được báo bằng
   * `signaling_redis_shards_ready` / `_total` (alert khi ready < total).
   */
  isReady(): boolean {
    return !this.shuttingDown && this.shardStatus().serving >= 1;
  }

  /**
   * Số shard mà CẢ lease lẫn fanout đều sẵn sàng (handshake của user thuộc shard đó mới thành công)
   * trên tổng số shard cấu hình.
   */
  shardStatus(): { serving: number; total: number } {
    const fanout = this.fanout;
    const total = this.connectionQuota.shardCount;
    if (!fanout) return { serving: 0, total };
    let serving = 0;
    for (let shard = 0; shard < total; shard += 1) {
      if (
        fanout.isShardReady(shard) &&
        this.connectionQuota.isShardReady(shard)
      ) {
        serving += 1;
      }
    }
    return { serving, total };
  }

  handleConnection(client: Socket): void {
    const data = client.data as SocketData;
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
    if (data.fanoutPreconnectCleanup) {
      client.conn.off('close', data.fanoutPreconnectCleanup);
      data.fanoutPreconnectCleanup = undefined;
    }
    if (!this.trackLease(client, userId)) return;
    void client.join(userRoom(userId));
    data.connectionCounted = true;
    this.metrics.connectionOpened();
    this.logger.debug(`User ${userId} connected: ${client.id}`);
  }

  handleDisconnect(client: Socket): void {
    const data = client.data as SocketData;
    if (data.connectionCounted) {
      data.connectionCounted = false;
      this.metrics.connectionClosed();
    }
    const leaseId = data.quotaLeaseId;
    if (leaseId && data.userId) {
      this.refresher?.remove(leaseId);
      this.activeLeases.delete(leaseId);
      data.quotaLeaseId = undefined;
      // Khi shutdown, `onModuleDestroy` release cả lô bằng pipeline — không release từng socket.
      if (!this.shuttingDown) {
        void this.connectionQuota
          .release(data.userId, leaseId)
          .catch((error) => {
            // Fail-safe: lease có TTL nên replica crash/Redis outage không giữ slot vĩnh viễn.
            this.logger.warn(
              `Không thể release connection quota: ${String(error)}`,
            );
            captureSentryException(error, 'signaling-connection-quota-release');
          });
      }
    }
    this.releaseFanout(client);
    this.logger.debug(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('ping')
  ping(): { event: string; data: string } {
    return { event: 'pong', data: 'pong' };
  }

  /** Thân middleware handshake (public để unit test): JWT → quota lease → subscribe Redis. */
  async admit(client: Socket): Promise<void> {
    if (this.shuttingDown) throw new Error(CONNECTION_QUOTA_UNAVAILABLE_ERROR);
    await this.authenticate(client);
    const userId = (client.data as SocketData).userId;
    if (!userId) throw new Error(RealtimeConnectionErrors.Unauthorized);
    if (!(await this.admitConnection(client, userId))) {
      throw new Error(CONNECTION_LIMIT_ERROR);
    }
    try {
      await this.admitFanout(client, userId);
    } catch (error) {
      // Socket sẽ không bao giờ `connect` → trả lease ngay thay vì đợi transport đóng.
      this.abortQuotaAdmission(client);
      throw error;
    }
  }

  /** Verify JWT từ `handshake.auth.token` — gán userId vào socket.data (public để unit test). */
  async authenticate(client: Socket): Promise<void> {
    const token = (client.handshake.auth as { token?: unknown }).token;
    if (typeof token !== 'string' || token === '') {
      throw new Error(RealtimeConnectionErrors.Unauthorized);
    }
    try {
      const payload = await verifyJwtWithRotation<AccessTokenPayload>(
        this.jwtService,
        token,
        this.previousJwtSecret,
      );
      if (typeof payload.sub !== 'string' || payload.sub === '') {
        throw new Error('missing sub');
      }
      (client.data as SocketData).userId = payload.sub;
    } catch {
      throw new Error(RealtimeConnectionErrors.Unauthorized);
    }
  }

  private async admitConnection(
    client: Socket,
    userId: string,
  ): Promise<boolean> {
    const leaseId = randomUUID();
    const data = client.data as SocketData;
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

  /** Hoàn tác lease đã acquire khi bước sau (subscribe) thất bại và socket sẽ không bao giờ `connect`. */
  private abortQuotaAdmission(client: Socket): void {
    const data = client.data as SocketData;
    const cleanup = data.quotaPreconnectCleanup;
    if (!cleanup) return;
    client.conn.off('close', cleanup);
    data.quotaPreconnectCleanup = undefined;
    cleanup();
  }

  /**
   * Subscribe Redis cho user TRƯỚC khi handshake hoàn tất. Mỗi lần gọi đếm một socket; huỷ đúng
   * một lần qua `releaseFanout` (idempotent theo cờ `fanoutUserId`) dù handshake thất bại, transport
   * đóng giữa chừng hay socket disconnect bình thường.
   */
  private async admitFanout(client: Socket, userId: string): Promise<void> {
    const data = client.data as SocketData;
    const fanout = this.fanout;
    if (!fanout) throw new Error(CONNECTION_QUOTA_UNAVAILABLE_ERROR);
    // Đặt cờ TRƯỚC khi await: transport đóng trong lúc chờ Redis vẫn thấy cờ và hoàn tác được.
    data.fanoutUserId = userId;
    const cleanup = () => this.releaseFanout(client);
    data.fanoutPreconnectCleanup = cleanup;
    client.conn.once('close', cleanup);
    try {
      await fanout.subscribeUser(userId);
    } catch (error) {
      client.conn.off('close', cleanup);
      data.fanoutPreconnectCleanup = undefined;
      this.releaseFanout(client);
      captureSentryException(error, 'signaling-fanout-subscribe');
      throw new Error(CONNECTION_QUOTA_UNAVAILABLE_ERROR, { cause: error });
    }
    if (
      !data.fanoutUserId ||
      client.conn.readyState === 'closed' ||
      this.shuttingDown
    ) {
      client.conn.off('close', cleanup);
      data.fanoutPreconnectCleanup = undefined;
      this.releaseFanout(client);
      throw new Error(CONNECTION_QUOTA_UNAVAILABLE_ERROR);
    }
  }

  private releaseFanout(client: Socket): void {
    const data = client.data as SocketData;
    const userId = data.fanoutUserId;
    if (!userId) return;
    data.fanoutUserId = undefined;
    this.fanout?.releaseUser(userId);
  }

  private trackLease(client: Socket, userId: string): boolean {
    const leaseId = (client.data as SocketData).quotaLeaseId;
    if (!leaseId) {
      client.disconnect(true);
      return false;
    }
    this.activeLeases.set(leaseId, { userId, client });
    // Hết hạn lease mà không gia hạn được → ngắt socket (lease-refresher giải thích khi nào).
    this.refresher?.add(leaseId, userId, () => client.disconnect(true));
    return true;
  }

  /**
   * Relay Redis → socket room của đúng user; payload không đọc/sửa (public để unit test).
   *
   * Chỉ emit cho room CỤC BỘ của pod này (`server.local`): ở chế độ `pattern` mọi pod đều nhận
   * cùng một event, còn broadcast không-local sẽ được cluster adapter chuyển tiếp sang pod khác và
   * socket nhận N bản (N = số pod). Kiểm tra room TRƯỚC khi parse JSON: ở chế độ `pattern` đa số
   * event không dành cho user nào trên pod, và ở chế độ `user` đây là lưới an toàn cho event tới
   * muộn sau khi socket cuối của user đã rời.
   */
  relay(channel: string, raw: string): void {
    const userId = parseRealtimeUserChannel(channel);
    if (!userId) return; // channel lạ — bỏ qua
    const room = userRoom(userId);
    if (!this.hasLocalSockets(room)) {
      this.metrics.relay('no_local_room');
      return;
    }
    let envelope: RealtimeEnvelope;
    try {
      envelope = JSON.parse(raw) as RealtimeEnvelope;
    } catch {
      this.logger.warn(`Bỏ qua payload không phải JSON trên ${channel}`);
      this.metrics.relay('invalid');
      return;
    }
    if (typeof envelope?.event !== 'string') {
      this.metrics.relay('invalid');
      return;
    }
    this.server.local.to(room).emit(envelope.event, envelope.data);
    this.metrics.relay('delivered');
  }

  /** Room còn socket nào trên pod này không (`undefined` adapter = không biết → cứ emit). */
  private hasLocalSockets(room: string): boolean {
    const rooms = (
      this.server as unknown as {
        adapter?: { rooms?: ReadonlyMap<string, unknown> };
      }
    ).adapter?.rooms;
    return rooms ? rooms.has(room) : true;
  }
}
