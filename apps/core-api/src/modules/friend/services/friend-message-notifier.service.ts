import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ConversationMemberState } from '../entities/conversation-member-state.entity';
import { FriendMetrics } from './friend.metrics';
import { FRIEND_NOTIFY_GATE } from '../redis/friend-redis.provider';
import { NotificationService, NotificationType } from '../../notification';

import type { WindowGatePort } from '../../../common/redis/window-gate.port';
import type { CoreApiEnv } from '../../../config/env.validation';
import type { FriendMessageNotifyOutcome } from './friend.metrics';

export interface FriendMessageNotifyInput {
  conversationId: string;
  senderUserId: string;
  recipientId: string;
  preview: string;
}

/**
 * Quyết định thông báo (in-app + push) cho một tin nhắn bạn bè (docs/services/friend-service.md,
 * ADR 0013). Trước đây MỖI tin một notification + một lần push; ở 3.000 tin/giây đó là 3.000 insert
 * `notifications` và 3.000 lần gọi provider mỗi giây.
 *
 * Chính sách: trong mỗi cửa sổ `FRIEND_MESSAGE_NOTIFY_WINDOW_SECONDS` chỉ tin ĐẦU TIÊN của
 * (người nhận, hội thoại) tạo notification + push. Tin sau vẫn được lưu, publish realtime và tính
 * unread — chỉ kênh thông báo được gộp. Không dựa vào "đang online" (presence trễ tới một lease nên có
 * thể nuốt push của app nền) hay "còn notification chưa đọc" (đọc hội thoại không đánh dấu notification
 * đã đọc nên sẽ im lặng vĩnh viễn). Mute vẫn tắt hẳn kênh thông báo. Cổng là trạng thái tạm trong Redis,
 * lỗi Redis thì fail-open (thông báo như cũ).
 */
@Injectable()
export class FriendMessageNotifier {
  private readonly logger = new Logger(FriendMessageNotifier.name);

  constructor(
    @InjectRepository(ConversationMemberState)
    private readonly memberStateRepo: Repository<ConversationMemberState>,
    private readonly notificationService: NotificationService,
    private readonly config: ConfigService<CoreApiEnv, true>,
    @Inject(FRIEND_NOTIFY_GATE) private readonly gate: WindowGatePort,
    @Optional() private readonly metrics?: FriendMetrics,
  ) {}

  /**
   * Có thể throw (DB lỗi) — caller coi thông báo là best-effort và nuốt lỗi sau khi log. Nếu đã chiếm
   * cổng mà cuối cùng không tạo được thông báo (mute/lỗi) thì mở lại cổng để tin kế tiếp không bị nuốt.
   */
  async notify(input: FriendMessageNotifyInput): Promise<void> {
    const windowSeconds = this.config.getOrThrow(
      'FRIEND_MESSAGE_NOTIFY_WINDOW_SECONDS',
      { infer: true },
    );
    const gateKey = `friend:msg-notify:${input.recipientId}:${input.conversationId}`;

    let acquired = false;
    if (windowSeconds > 0) {
      try {
        if (!(await this.gate.tryAcquire(gateKey, windowSeconds))) {
          this.observe('coalesced');
          return;
        }
        acquired = true;
      } catch (err) {
        // Fail-open: không để lỗi Redis nuốt thông báo — quay về hành vi cũ (mỗi tin một thông báo).
        this.observe('gate_error');
        this.logger.warn(
          `Cổng gộp thông báo lỗi, thông báo như cũ: ${errorMessage(err)}`,
        );
      }
    }

    let notified = false;
    try {
      const state = await this.memberStateRepo.findOne({
        where: {
          conversationId: input.conversationId,
          userId: input.recipientId,
        },
      });
      // Người nhận mute hội thoại → bỏ qua cả in-app lẫn push; tin + realtime + unread vẫn chạy.
      if (state?.mutedAt != null) {
        this.observe('muted');
        return;
      }
      const notification = await this.notificationService.create({
        userId: input.recipientId,
        type: NotificationType.FriendMessage,
        payload: {
          conversationId: input.conversationId,
          senderUserId: input.senderUserId,
          preview: input.preview,
        },
      });
      notified = true;
      this.observe('notified');
      await this.notificationService.sendPush(notification);
    } catch (err) {
      if (!notified) this.observe('error');
      throw err;
    } finally {
      if (acquired && !notified) await this.releaseGate(gateKey);
    }
  }

  private async releaseGate(gateKey: string): Promise<void> {
    try {
      await this.gate.release(gateKey);
    } catch (err) {
      // Tệ nhất: tin kế tiếp trong cửa sổ không thông báo (cửa sổ tự hết hạn).
      this.logger.warn(`Mở lại cổng gộp thông báo lỗi: ${errorMessage(err)}`);
    }
  }

  private observe(outcome: FriendMessageNotifyOutcome): void {
    this.metrics?.observeNotify(outcome);
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
