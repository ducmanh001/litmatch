import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { RealtimeEvents } from '@litmatch/common-dtos';

import { publishRealtimeEvent } from '../../../common/realtime/publish-realtime';
import { FRIEND_REDIS } from '../redis/friend-redis.provider';
import { ConversationService } from '../services/conversation.service';
import { StreakService } from '../services/streak.service';
import { NotificationService, NotificationType } from '../../notification';

import type Redis from 'ioredis';
import type {
  FriendStreakAtRiskEventData,
  RealtimeEnvelope,
} from '@litmatch/common-dtos';
import type { CoreApiEnv } from '../../../config/env.validation';

const STREAK_WARNING_JOB = 'friend-streak-warning';

/**
 * Cron cảnh báo "sắp mất streak" (docs/services/streak-service.md § 4) — best-effort, KHÔNG
 * BAO GIỜ ghi `currentStreak`/`longestStreak` (chỉ `StreakService.recordActivity` trong
 * transaction `sendMessage` được ghi 2 cột đó). 1 conversation chỉ cảnh báo tối đa 1 lần/ngày
 * UTC (idempotent theo `lastWarningSentAt`, xem `StreakService.markWarningSent`).
 */
@Injectable()
export class StreakWarningJob
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(StreakWarningJob.name);
  private running = false;

  constructor(
    private readonly streakService: StreakService,
    private readonly conversationService: ConversationService,
    private readonly notificationService: NotificationService,
    private readonly config: ConfigService<CoreApiEnv, true>,
    private readonly scheduler: SchedulerRegistry,
    @Inject(FRIEND_REDIS) private readonly redis: Redis,
  ) {}

  onApplicationBootstrap(): void {
    const interval = setInterval(
      () =>
        void this.runOnce().catch((err) =>
          this.logger.error({ err: `${err}` }, 'Streak warning job lỗi'),
        ),
      this.config.getOrThrow('STREAK_WARNING_CHECK_INTERVAL_MS', {
        infer: true,
      }),
    );
    this.scheduler.addInterval(STREAK_WARNING_JOB, interval);
  }

  onApplicationShutdown(): void {
    if (this.scheduler.doesExist('interval', STREAK_WARNING_JOB)) {
      this.scheduler.deleteInterval(STREAK_WARNING_JOB);
    }
  }

  /** 1 tick — public để test/chạy tay. */
  async runOnce(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const conversationIds =
        await this.streakService.findConversationsNeedingWarning();
      for (const conversationId of conversationIds) {
        try {
          await this.warnOne(conversationId);
        } catch (err) {
          this.logger.error(
            { err: `${err}` },
            `Cảnh báo streak cho conversation ${conversationId} lỗi — thử lại tick sau`,
          );
        }
      }
    } finally {
      this.running = false;
    }
  }

  private async warnOne(conversationId: string): Promise<void> {
    const conversation =
      await this.conversationService.findById(conversationId);
    if (!conversation) return; // đã bị xoá giữa lúc query và xử lý — bỏ qua êm

    const envelope: RealtimeEnvelope<FriendStreakAtRiskEventData> = {
      event: RealtimeEvents.FriendStreakAtRisk,
      data: { conversationId },
    };
    const memberIds = [conversation.userLowId, conversation.userHighId];
    await Promise.all(
      memberIds.map((uid) =>
        publishRealtimeEvent(this.redis, this.logger, uid, envelope),
      ),
    );

    for (const uid of memberIds) {
      try {
        const notification = await this.notificationService.create({
          userId: uid,
          type: NotificationType.StreakAtRisk,
          payload: { conversationId },
        });
        await this.notificationService.sendPush(notification);
      } catch (err) {
        this.logger.warn(
          `Tạo notification streak-warning lỗi (bỏ qua): ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    await this.streakService.markWarningSent(conversationId);
  }
}
