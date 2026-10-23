import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In } from 'typeorm';

import { AuditLogService } from '../../../common/audit/audit-log.service';
import { ManagedInterval } from '../../../common/scheduling/managed-interval';
import { EconomyService } from '../../economy';
import { NotificationService } from '../../notification';
import { UserService } from '../../user';
import {
  BroadcastAudience,
  BroadcastStatus,
  NotificationBroadcast,
} from '../entities/notification-broadcast.entity';

import type { Notification } from '../../notification';
import type { CoreApiEnv } from '../../../config/env.validation';

const BROADCAST_DISPATCH_JOB = 'admin-broadcast-dispatch';
/** Số lô lỗi liên tiếp trước khi đánh dấu broadcast `failed` (lỗi thoáng qua tự khỏi ở tick sau). */
const MAX_CONSECUTIVE_FAILURES = 5;
/** Push là gọi ra ngoài (FCM/Web Push) — giới hạn đồng thời để một lô 500 không mở 500 kết nối cùng lúc. */
const PUSH_CONCURRENCY = 20;

/**
 * Gửi broadcast thông báo của admin ở nền (ADR 0013). `AdminService.broadcastNotification` chỉ xếp hàng một dòng
 * `notification_broadcasts`; job này (cluster singleton) duyệt user active theo keyset `users.id`, mỗi lô tối đa
 * `ADMIN_BROADCAST_BATCH_SIZE` người, tối đa `ADMIN_BROADCAST_MAX_BATCHES_PER_TICK` lô mỗi tick.
 *
 * Đúng-một-lần cho thông báo in-app: lô thông báo, `cursor_user_id` và `recipient_count` ghi trong CÙNG một
 * transaction, nên pod chết giữa chừng thì tick sau chạy tiếp từ cursor đã commit — không trùng, không sót. Dòng
 * broadcast được khoá `FOR UPDATE` và kiểm tra cursor còn như lúc đọc (optimistic) ngay trước khi ghi, nên hai
 * runner chồng nhau (failover) không gửi trùng một lô. Giữ transaction ngắn: đọc trang user và lọc VIP làm TRƯỚC
 * transaction, trong transaction chỉ INSERT lô + cập nhật cursor.
 *
 * Push là best-effort sau khi lô đã commit (giống luồng cũ): pod chết giữa commit và push thì lô đó mất push nhưng
 * vẫn có thông báo in-app. Lỗi lô: ghi `failure_count`/`last_error`, tick sau thử lại; quá
 * `MAX_CONSECUTIVE_FAILURES` lần liên tiếp thì `failed` + audit để admin biết.
 */
@Injectable()
export class BroadcastDispatchJob
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(BroadcastDispatchJob.name);
  private readonly job = new ManagedInterval();

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService<CoreApiEnv, true>,
    private readonly scheduler: SchedulerRegistry,
    private readonly userService: UserService,
    private readonly economyService: EconomyService,
    private readonly notificationService: NotificationService,
    private readonly auditLogService: AuditLogService,
  ) {}

  onApplicationBootstrap(): void {
    this.job.start(this.scheduler, {
      jobName: BROADCAST_DISPATCH_JOB,
      intervalMs: this.config.getOrThrow('ADMIN_BROADCAST_JOB_INTERVAL_MS', {
        infer: true,
      }),
      task: () => this.runOnce(),
      logger: this.logger,
      errorMessage: 'Gửi broadcast nền lỗi',
      clusterSingleton: { dataSource: this.dataSource },
    });
  }

  onApplicationShutdown(): void {
    this.job.stop();
  }

  /** 1 tick — trả số lô đã xử lý. Public để test/chạy tay. */
  async runOnce(): Promise<number> {
    return this.job.runExclusive(async () => {
      const batchSize = this.config.getOrThrow('ADMIN_BROADCAST_BATCH_SIZE', {
        infer: true,
      });
      const maxBatches = this.config.getOrThrow(
        'ADMIN_BROADCAST_MAX_BATCHES_PER_TICK',
        { infer: true },
      );
      let processed = 0;
      while (processed < maxBatches) {
        const broadcast = await this.nextOpenBroadcast();
        if (broadcast === null) break;
        try {
          const advanced = await this.processBatch(broadcast, batchSize);
          // Runner khác đã đẩy cursor đi trước — nhường tick sau đọc lại trạng thái mới.
          if (!advanced) break;
          processed += 1;
        } catch (error) {
          await this.recordFailure(broadcast, error);
          break;
        }
      }
      return processed;
    }, 0);
  }

  private nextOpenBroadcast(): Promise<NotificationBroadcast | null> {
    return this.dataSource.getRepository(NotificationBroadcast).findOne({
      where: { status: In([BroadcastStatus.Queued, BroadcastStatus.Running]) },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
  }

  /** Trả `false` nếu cursor đã bị runner khác đẩy đi (không ghi gì). */
  private async processBatch(
    broadcast: NotificationBroadcast,
    batchSize: number,
  ): Promise<boolean> {
    const userIds = await this.userService.listActiveUserIdsPage({
      afterId: broadcast.cursorUserId,
      createdAtOrBefore: broadcast.createdAt,
      limit: batchSize,
    });
    const recipientIds = await this.filterAudience(broadcast.audience, userIds);
    // Trang ngắn hơn lô = đã hết user: hoàn tất ngay trong cùng transaction, khỏi tốn thêm một tick rỗng.
    const done = userIds.length < batchSize;
    const nextCursor =
      userIds.length > 0 ? userIds[userIds.length - 1] : broadcast.cursorUserId;

    const created = await this.dataSource.transaction(async (manager) => {
      const [locked] = await manager.query<Array<{ id: string }>>(
        `SELECT id FROM notification_broadcasts
          WHERE id = $1
            AND status IN ('queued', 'running')
            AND cursor_user_id IS NOT DISTINCT FROM $2::uuid
            FOR UPDATE`,
        [broadcast.id, broadcast.cursorUserId],
      );
      if (locked === undefined) return null;

      const notifications =
        await this.notificationService.createBroadcastWithManager(
          manager,
          recipientIds,
          { title: broadcast.title, body: broadcast.body },
        );
      // UPDATE ... RETURNING qua manager.query trả [rows, rowCount].
      const [rows] = await manager.query<
        [Array<{ recipientCount: number }>, number]
      >(
        `UPDATE notification_broadcasts
            SET cursor_user_id = $2::uuid,
                recipient_count = recipient_count + $3::int,
                status = $4::varchar,
                started_at = COALESCE(started_at, now()),
                completed_at = CASE WHEN $5::boolean THEN now() ELSE NULL END,
                failure_count = 0,
                last_error = NULL,
                updated_at = now()
          WHERE id = $1
          RETURNING recipient_count AS "recipientCount"`,
        [
          broadcast.id,
          nextCursor,
          notifications.length,
          done ? BroadcastStatus.Completed : BroadcastStatus.Running,
          done,
        ],
      );
      if (done) {
        await this.auditLogService.record(
          {
            actorUserId: broadcast.actorUserId,
            action: 'notification.broadcast.completed',
            targetType: 'notification_broadcast',
            targetId: broadcast.id,
            metadata: {
              audience: broadcast.audience,
              recipientCount: rows[0]?.recipientCount ?? notifications.length,
              title: broadcast.title,
            },
          },
          manager,
        );
      }
      return notifications;
    });
    if (created === null) return false;

    await this.pushAll(created);
    return true;
  }

  private async filterAudience(
    audience: BroadcastAudience,
    userIds: readonly string[],
  ): Promise<string[]> {
    if (audience === BroadcastAudience.All) return [...userIds];
    const vip = await this.economyService.filterActiveVipUserIds(userIds);
    return userIds.filter((userId) =>
      audience === BroadcastAudience.Vip ? vip.has(userId) : !vip.has(userId),
    );
  }

  /** `sendPush` không bao giờ throw (best-effort); chỉ cần giới hạn số lời gọi đồng thời. */
  private async pushAll(notifications: readonly Notification[]): Promise<void> {
    let next = 0;
    const worker = async (): Promise<void> => {
      while (next < notifications.length) {
        const notification = notifications[next];
        next += 1;
        await this.notificationService.sendPush(notification);
      }
    };
    await Promise.all(
      Array.from(
        { length: Math.min(PUSH_CONCURRENCY, notifications.length) },
        worker,
      ),
    );
  }

  private async recordFailure(
    broadcast: NotificationBroadcast,
    error: unknown,
  ): Promise<void> {
    const message = (
      error instanceof Error ? error.message : String(error)
    ).slice(0, 500);
    this.logger.error(
      { broadcastId: broadcast.id, err: message },
      'Lô broadcast lỗi — thử lại ở tick sau',
    );
    try {
      await this.dataSource.transaction(async (manager) => {
        const [rows] = await manager.query<
          [Array<{ status: BroadcastStatus }>, number]
        >(
          `UPDATE notification_broadcasts
              SET failure_count = failure_count + 1,
                  last_error = $2,
                  status = CASE WHEN failure_count + 1 >= $3::int THEN 'failed' ELSE status END,
                  updated_at = now()
            WHERE id = $1 AND status IN ('queued', 'running')
            RETURNING status`,
          [broadcast.id, message, MAX_CONSECUTIVE_FAILURES],
        );
        if (rows[0]?.status !== BroadcastStatus.Failed) return;
        await this.auditLogService.record(
          {
            actorUserId: broadcast.actorUserId,
            action: 'notification.broadcast.failed',
            targetType: 'notification_broadcast',
            targetId: broadcast.id,
            metadata: {
              audience: broadcast.audience,
              title: broadcast.title,
              error: message,
            },
          },
          manager,
        );
      });
    } catch (recordError) {
      // DB đang lỗi: đã log lỗi gốc; tick sau đọc lại trạng thái từ DB nên không mất cursor.
      this.logger.error(
        { broadcastId: broadcast.id, err: `${recordError}` },
        'Không ghi được trạng thái lỗi của broadcast',
      );
    }
  }
}
