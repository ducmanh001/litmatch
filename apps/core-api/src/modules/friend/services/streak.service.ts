import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import {
  addDaysUtc,
  daysBetweenUtc,
  todayUtc,
} from '../../../common/date/utc-date';
import { ConversationStreak } from '../entities/conversation-streak.entity';

import type { Conversation } from '../entities/conversation.entity';
import type { CoreApiEnv } from '../../../config/env.validation';

const STREAK_WARNING_BATCH_SIZE = 200;

export interface RecordActivityResult {
  streak: ConversationStreak;
  /** Số ngày streak vừa chạm — chỉ khác `null` đúng lúc streak tăng VÀ trúng mốc milestone. */
  milestoneHit: number | null;
}

export interface DisplayStreak {
  current: number;
  longest: number;
  isActive: boolean;
}

/**
 * `recordActivity` sẽ KHÔNG đổi gì khi người gửi đã được ghi nhận hôm nay VÀ không còn bước xác
 * nhận nào đang chờ (bên kia chưa nhắn hôm nay, hoặc hôm nay đã xác nhận rồi). Điều kiện cuối chỉ
 * để chặn dữ liệu bất thường (cả hai bên đã "active" mà chưa được xác nhận): vẫn đi qua transaction
 * để sửa, thay vì bị đường nhanh bỏ qua.
 */
function isNoOpActivity(
  row: ConversationStreak,
  senderIsLow: boolean,
  today: string,
): boolean {
  const senderToday =
    (senderIsLow ? row.userLowLastActiveDate : row.userHighLastActiveDate) ===
    today;
  const otherToday =
    (senderIsLow ? row.userHighLastActiveDate : row.userLowLastActiveDate) ===
    today;
  return senderToday && !(otherToday && row.lastConfirmedDate !== today);
}

/**
 * Streak trò chuyện (docs/services/streak-service.md) — sub-service nội bộ của `friend`, chỉ
 * `FriendService` gọi (docs/05 § 5.3). Tính on-write: `recordActivity` khoá row FOR UPDATE để
 * serialize 2 bên gửi message gần như đồng thời, tự tạo row nếu chưa có (1:1 lazy với
 * Conversation cũ, không có cách nào tạo atomic cùng Friendship cho các cặp đã là bạn từ trước
 * khi tính năng này ra đời).
 */
@Injectable()
export class StreakService {
  private readonly logger = new Logger(StreakService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(ConversationStreak)
    private readonly streakRepo: Repository<ConversationStreak>,
    private readonly config: ConfigService<CoreApiEnv, true>,
  ) {}

  /**
   * Gọi SAU KHI message đã persist thành công (kể cả replay idempotency) — idempotent tự nhiên:
   * gọi lại trong cùng ngày UTC không tăng streak lần 2 (guard `lastConfirmedDate !== today`).
   */
  async recordActivity(
    conversation: Conversation,
    senderUserId: string,
  ): Promise<RecordActivityResult> {
    const isLow = conversation.userLowId === senderUserId;
    const today = todayUtc();

    // Đường nhanh: sau tin đầu tiên của người gửi trong ngày UTC, mọi tin tiếp theo của họ không
    // đổi gì trong row này, nhưng transaction bên dưới vẫn tốn một row lock và vài round trip cho
    // MỖI tin nhắn. Đọc không khoá để bỏ qua các lời gọi đó. An toàn dưới race: các cột ngày chỉ
    // tiến tới `today` và `lastConfirmedDate` được đặt trong cùng transaction với ngày của bên
    // thứ hai, nên bản đọc cũ chỉ có thể báo "còn việc" (đi tiếp vào transaction, nơi mọi thứ
    // được đọc lại dưới lock), không bao giờ báo "không còn việc" sai.
    const current = await this.streakRepo.findOneBy({
      conversationId: conversation.id,
    });
    if (current && isNoOpActivity(current, isLow, today)) {
      return { streak: current, milestoneHit: null };
    }

    return this.dataSource.transaction(async (manager) => {
      await manager.query(
        `INSERT INTO conversation_streaks (conversation_id) VALUES ($1)
         ON CONFLICT (conversation_id) DO NOTHING`,
        [conversation.id],
      );
      const row = await manager
        .createQueryBuilder(ConversationStreak, 'cs')
        .where('cs.conversationId = :id', { id: conversation.id })
        .setLock('pessimistic_write')
        .getOneOrFail();

      if (isLow) row.userLowLastActiveDate = today;
      else row.userHighLastActiveDate = today;

      let milestoneHit: number | null = null;
      const bothActiveToday =
        row.userLowLastActiveDate === today &&
        row.userHighLastActiveDate === today;
      if (bothActiveToday && row.lastConfirmedDate !== today) {
        const gapDays = row.lastConfirmedDate
          ? daysBetweenUtc(row.lastConfirmedDate, today)
          : null;
        if (gapDays === null || gapDays === 1) {
          row.currentStreak += 1;
        } else if (gapDays === 2) {
          // 1 ngày lỡ được cứu ĐÚNG 1 lần — không phải tài nguyên giới hạn (§ 3 spec)
          row.currentStreak += 1;
          row.graceUsedForDate = addDaysUtc(row.lastConfirmedDate as string, 1);
        } else {
          row.currentStreak = 1; // gapDays >= 3 (hoặc dữ liệu bất thường) — reset
        }
        row.longestStreak = Math.max(row.longestStreak, row.currentStreak);
        row.lastConfirmedDate = today;

        const milestones = this.parseMilestoneDays();
        if (milestones.includes(row.currentStreak)) {
          milestoneHit = row.currentStreak;
        }
      }

      await manager.save(row);
      return { streak: row, milestoneHit };
    });
  }

  /**
   * Mood hiện tại derive khi đọc — KHÔNG ghi gì (cùng triết lý VIP downgrade/Party Room grace).
   * `isActive=false` (gap >= 3 ngày kể từ lần xác nhận gần nhất) → hiển thị current=0 dù DB
   * chưa reset chính thức (reset thật chỉ xảy ra lúc có message mới qua `recordActivity`).
   */
  async getDisplayStreak(
    conversationId: string,
  ): Promise<DisplayStreak | null> {
    const row = await this.streakRepo.findOneBy({ conversationId });
    if (!row) return null;
    const gapDays = row.lastConfirmedDate
      ? daysBetweenUtc(row.lastConfirmedDate, todayUtc())
      : null;
    const isActive = gapDays !== null && gapDays <= 2;
    return {
      current: isActive ? row.currentStreak : 0,
      longest: row.longestStreak,
      isActive,
    };
  }

  /**
   * 1 tick cron cảnh báo "sắp mất" — best-effort, KHÔNG BAO GIỜ ghi streak. Chỉ cảnh báo
   * conversation có streak > 0, chưa xác nhận hôm nay (gapDays=1 — hôm qua đã nhắn, hôm nay
   * chưa), đã qua mốc giờ `STREAK_WARNING_HOURS` trong ngày UTC, và chưa cảnh báo hôm nay.
   * Trả về danh sách conversationId cần cảnh báo — caller (FriendService) tự publish
   * realtime/notification vì StreakService không phụ thuộc Notification/Redis (docs/05 § 5.3).
   */
  async findConversationsNeedingWarning(): Promise<string[]> {
    const warningHour = this.config.getOrThrow('STREAK_WARNING_HOURS', {
      infer: true,
    });
    if (new Date().getUTCHours() < warningHour) return [];

    const today = todayUtc();
    const yesterday = addDaysUtc(today, -1);
    const rows = await this.streakRepo
      .createQueryBuilder('cs')
      .where('cs.currentStreak > 0')
      .andWhere('cs.lastConfirmedDate = :yesterday', { yesterday })
      .andWhere(
        '(cs.lastWarningSentAt IS NULL OR cs.lastWarningSentAt < :startOfToday)',
        { startOfToday: new Date(`${today}T00:00:00.000Z`) },
      )
      .orderBy('cs.lastConfirmedDate', 'ASC')
      .addOrderBy('cs.conversationId', 'ASC')
      .limit(STREAK_WARNING_BATCH_SIZE)
      .getMany();
    return rows.map((r) => r.conversationId);
  }

  /** Đánh dấu đã cảnh báo hôm nay — idempotent, gọi ngay sau khi publish thành công 1 conversation. */
  async markWarningSent(conversationId: string): Promise<void> {
    await this.streakRepo.update(
      { conversationId },
      { lastWarningSentAt: new Date() },
    );
  }

  private parseMilestoneDays(): number[] {
    return this.config
      .getOrThrow('STREAK_MILESTONE_DAYS', { infer: true })
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0);
  }
}
