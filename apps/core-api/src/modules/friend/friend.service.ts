import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { RealtimeEvents } from '@litmatch/common-dtos';
import { DomainException } from '@litmatch/common-exceptions';
import { EntityManager, Repository } from 'typeorm';

import { canonicalPair } from '../../common/entities/canonical-pair';
import { publishRealtimeEvent } from '../../common/realtime/publish-realtime';
import { FriendErrors } from './friend.errors';
import { Conversation } from './entities/conversation.entity';
import { ConversationMemberState } from './entities/conversation-member-state.entity';
import { Friendship, FriendshipSource } from './entities/friendship.entity';
import { Message } from './entities/message.entity';
import { FRIEND_REDIS } from './redis/friend-redis.provider';
import { ConversationService } from './services/conversation.service';
import { StreakService } from './services/streak.service';
import { NotificationService, NotificationType } from '../notification';
import { SafetyService } from '../safety';

import type {
  CursorPage,
  FriendMessageEventData,
  FriendStreakIncreasedEventData,
  RealtimeEnvelope,
} from '@litmatch/common-dtos';
import type Redis from 'ioredis';
import type { CoreApiEnv } from '../../config/env.validation';
import type { MessageAttachment } from './entities/message.entity';
import type { DisplayStreak } from './services/streak.service';

/** Kết quả tạo quan hệ — `created=false` nghĩa là cặp đã là bạn từ trước (idempotent). */
export interface EnsureFriendshipResult {
  created: boolean;
}

export interface FriendListEntry {
  partnerId: string;
  conversationId: string;
  friendSince: Date;
  lastMessageAt: Date | null;
  /** Số message của ĐỐI PHƯƠNG sau mốc lastReadAt của caller — 0 nếu đã đọc hết. */
  unreadCount: number;
  /** Nội dung message mới nhất (bất kể chiều) — null khi chưa chat lần nào. */
  lastMessagePreview: string | null;
  /** Caller đang tắt thông báo hội thoại này. */
  muted: boolean;
}

/** Trạng thái cá nhân caller trong 1 conversation — trả về từ mark-read/mute. */
export interface MemberStateView {
  lastReadAt: Date | null;
  muted: boolean;
}

/**
 * Facade của Friend module (docs/services/friend-service.md): Friendship (từ Soul Match) +
 * Conversation/Message (chat 1-1 lâu dài — Giai đoạn 2 "Friend + Chat 1-1"). ConversationService
 * là sub-service nội bộ, chỉ facade này gọi (không export — docs/05 § 5.3).
 */
@Injectable()
export class FriendService {
  private readonly logger = new Logger(FriendService.name);

  constructor(
    @InjectRepository(Friendship)
    private readonly friendshipRepo: Repository<Friendship>,
    @InjectRepository(ConversationMemberState)
    private readonly memberStateRepo: Repository<ConversationMemberState>,
    private readonly conversationService: ConversationService,
    private readonly streakService: StreakService,
    private readonly safetyService: SafetyService,
    private readonly notificationService: NotificationService,
    private readonly config: ConfigService<CoreApiEnv, true>,
    @Inject(FRIEND_REDIS) private readonly redis: Redis,
  ) {}

  /**
   * Tạo quan hệ bạn + Conversation ATOMICALLY nếu chưa có — cả 2 idempotent bằng
   * `ON CONFLICT DO NOTHING` trên cặp canonical, CÙNG transaction của caller (Soul Match
   * rating) để bất biến "có Friendship ⟺ có Conversation" luôn đúng (spec § 1). Nhận
   * EntityManager để tham gia transaction gọi — cùng pattern UserService.createWithManager
   * (docs/03 § 3.7).
   */
  async ensureFriendship(
    manager: EntityManager,
    userAId: string,
    userBId: string,
    source: FriendshipSource,
  ): Promise<EnsureFriendshipResult> {
    if (userAId === userBId) {
      throw new Error(
        `Không thể tạo friendship với chính mình (${userAId}) — dữ liệu session hỏng`,
      );
    }
    const [userLowId, userHighId] = canonicalPair(userAId, userBId);
    const result = await manager
      .createQueryBuilder()
      .insert()
      .into(Friendship)
      .values({ userLowId, userHighId, source })
      .orIgnore()
      .execute();
    // Conversation tạo cùng lúc, dù Friendship replay hay mới — bất biến 1:1 không phụ thuộc nhánh nào
    await manager
      .createQueryBuilder()
      .insert()
      .into(Conversation)
      .values({ userLowId, userHighId, lastMessageAt: null })
      .orIgnore()
      .execute();
    // ON CONFLICT DO NOTHING → RETURNING rỗng khi dòng đã tồn tại
    return { created: result.raw.length > 0 };
  }

  async areFriends(userAId: string, userBId: string): Promise<boolean> {
    if (userAId === userBId) return false;
    const [userLowId, userHighId] = canonicalPair(userAId, userBId);
    return this.friendshipRepo.exists({ where: { userLowId, userHighId } });
  }

  /**
   * Toàn bộ userId đang là bạn — dùng cho các module cần lọc theo TOÀN BỘ graph bạn bè (vd
   * Stories ring `authorUserId IN (self, ...friendIds)`), khác `areFriends` (1 cặp/lần).
   */
  async listFriendIds(userId: string): Promise<string[]> {
    const rows = await this.friendshipRepo
      .createQueryBuilder('f')
      .select([
        'f.user_low_id AS user_low_id',
        'f.user_high_id AS user_high_id',
      ])
      .where('f.userLowId = :userId OR f.userHighId = :userId', { userId })
      .getRawMany<{ user_low_id: string; user_high_id: string }>();
    return rows.map((r) =>
      r.user_low_id === userId ? r.user_high_id : r.user_low_id,
    );
  }

  /** Danh sách bạn sort theo chat gần nhất (bạn mới, chưa chat lần nào → sort theo friendSince). */
  async listFriends(userId: string): Promise<FriendListEntry[]> {
    const rows = await this.friendshipRepo
      .createQueryBuilder('f')
      .innerJoin(
        'conversations',
        'c',
        'c.user_low_id = f.user_low_id AND c.user_high_id = f.user_high_id',
      )
      // Trạng thái đọc/mute là CÁ NHÂN caller — lazy row, vắng = chưa đọc gì và không mute.
      .leftJoin(
        'conversation_member_states',
        's',
        's.conversation_id = c.id AND s.user_id = :userId',
        { userId },
      )
      .select([
        'f.user_low_id AS user_low_id',
        'f.user_high_id AS user_high_id',
        'f.created_at AS friend_since',
        'c.id AS conversation_id',
        'c.last_message_at AS last_message_at',
        's.muted_at IS NOT NULL AS muted',
      ])
      // Unread đếm theo message ĐỐI PHƯƠNG sau mốc đã đọc; preview là message mới nhất 2 chiều.
      // Subquery per-row chạy trên index (conversation_id, seq) — list bạn bè cỡ trăm, chấp nhận.
      .addSelect(
        `(SELECT count(*) FROM messages m
           WHERE m.conversation_id = c.id
             AND m.sender_user_id <> :userId
             AND m.created_at > COALESCE(s.last_read_at, 'epoch'::timestamptz))`,
        'unread_count',
      )
      .addSelect(
        `(SELECT m.content FROM messages m
           WHERE m.conversation_id = c.id
           ORDER BY m.seq DESC LIMIT 1)`,
        'last_message_preview',
      )
      .where('f.user_low_id = :userId OR f.user_high_id = :userId', { userId })
      .orderBy('c.last_message_at', 'DESC', 'NULLS LAST')
      .addOrderBy('f.created_at', 'DESC')
      .getRawMany<{
        user_low_id: string;
        user_high_id: string;
        friend_since: Date;
        conversation_id: string;
        last_message_at: Date | null;
        muted: boolean;
        unread_count: string;
        last_message_preview: string | null;
      }>();

    return rows.map((r) => ({
      partnerId: r.user_low_id === userId ? r.user_high_id : r.user_low_id,
      conversationId: r.conversation_id,
      friendSince: r.friend_since,
      lastMessageAt: r.last_message_at,
      unreadCount: Number(r.unread_count),
      lastMessagePreview: r.last_message_preview,
      muted: r.muted,
    }));
  }

  /**
   * Đánh dấu đã đọc tới thời điểm hiện tại — idempotent (gọi lại chỉ đẩy mốc tiến lên).
   * Upsert atomic bằng ON CONFLICT — hai tab cùng gọi không tạo dòng đôi.
   */
  async markConversationRead(
    userId: string,
    conversationId: string,
  ): Promise<MemberStateView> {
    await this.getConversationForMember(userId, conversationId);
    await this.memberStateRepo
      .createQueryBuilder()
      .insert()
      .into(ConversationMemberState)
      .values({ conversationId, userId, lastReadAt: () => 'now()' })
      .orUpdate(['last_read_at'], ['conversation_id', 'user_id'])
      .execute();
    return this.getMemberState(userId, conversationId);
  }

  /** Bật/tắt thông báo hội thoại — idempotent theo trạng thái đích. */
  async setConversationMuted(
    userId: string,
    conversationId: string,
    muted: boolean,
  ): Promise<MemberStateView> {
    await this.getConversationForMember(userId, conversationId);
    await this.memberStateRepo
      .createQueryBuilder()
      .insert()
      .into(ConversationMemberState)
      .values({
        conversationId,
        userId,
        mutedAt: muted ? () => 'now()' : null,
      })
      .orUpdate(['muted_at'], ['conversation_id', 'user_id'])
      .execute();
    return this.getMemberState(userId, conversationId);
  }

  private async getMemberState(
    userId: string,
    conversationId: string,
  ): Promise<MemberStateView> {
    const state = await this.memberStateRepo.findOne({
      where: { conversationId, userId },
    });
    return {
      lastReadAt: state?.lastReadAt ?? null,
      muted: state?.mutedAt != null,
    };
  }

  /**
   * Conversation với đúng 1 bạn cụ thể — dùng để nhảy thẳng từ unlock-profile (Soul Match)
   * sang chat (spec § 4). `friendUserId` không phải bạn → 404 (không phân biệt
   * "chưa từng là bạn" với "user không tồn tại" — chống oracle dò userId).
   */
  async getConversationWithFriend(
    userId: string,
    friendUserId: string,
  ): Promise<Conversation> {
    if (userId === friendUserId) {
      throw new DomainException(
        FriendErrors.NOT_FRIEND,
        'Không thể tự kết bạn với chính mình',
        HttpStatus.NOT_FOUND,
      );
    }
    const conversation = await this.conversationService.findByPair(
      userId,
      friendUserId,
    );
    if (!conversation) {
      throw new DomainException(
        FriendErrors.NOT_FRIEND,
        'Không phải bạn của bạn',
        HttpStatus.NOT_FOUND,
      );
    }
    return conversation;
  }

  /** Streak hiện tại — derive khi đọc, guard membership (docs/10 § 10.1.D). */
  async getStreak(
    userId: string,
    conversationId: string,
  ): Promise<DisplayStreak | null> {
    await this.getConversationForMember(userId, conversationId);
    return this.streakService.getDisplayStreak(conversationId);
  }

  /** List message theo cursor — guard membership (docs/10 § 10.1.D). */
  async listMessages(
    userId: string,
    conversationId: string,
    limit: number,
    cursor?: string,
  ): Promise<CursorPage<Message>> {
    await this.getConversationForMember(userId, conversationId);
    return this.conversationService.listMessages(conversationId, limit, cursor);
  }

  /**
   * Gửi message — guard membership + block (2 chiều) + validate độ dài + publish realtime sau
   * persist. Block trả CÙNG mã lỗi/status với "không phải thành viên" (docs/services/
   * safety-service.md § 6) — không tiết lộ ai block ai qua mã lỗi khác nhau, tránh oracle.
   * `attachment`: HTTP chỉ set được `kind='image'` (whitelist ở controller); các kind nội bộ
   * khác (vd Feed reply-to-story) vẫn chỉ đi qua DI — xem `ConversationService.sendMessage`.
   */
  async sendMessage(
    userId: string,
    conversationId: string,
    content: string,
    idempotencyKey: string,
    attachment: MessageAttachment | null = null,
  ): Promise<Message> {
    const conversation = await this.getConversationForMember(
      userId,
      conversationId,
    );
    const partnerId =
      conversation.userLowId === userId
        ? conversation.userHighId
        : conversation.userLowId;
    if (
      (await this.safetyService.isBlocked(userId, partnerId)) ||
      (await this.safetyService.isBlocked(partnerId, userId))
    ) {
      throw new DomainException(
        FriendErrors.CONVERSATION_NOT_FOUND,
        'Không tìm thấy conversation',
        HttpStatus.NOT_FOUND,
      );
    }
    const maxLength = this.config.getOrThrow('FRIEND_MESSAGE_MAX_LENGTH', {
      infer: true,
    });
    if (content.length > maxLength) {
      throw new DomainException(
        FriendErrors.MESSAGE_TOO_LONG,
        `Message dài quá ${maxLength} ký tự`,
        HttpStatus.UNPROCESSABLE_ENTITY,
        { maxLength },
      );
    }
    // Text rỗng chỉ hợp lệ khi là message ảnh — không có gì để gửi thì chặn.
    if (content.trim().length === 0 && attachment === null) {
      throw new DomainException(
        FriendErrors.MESSAGE_EMPTY,
        'Nhập nội dung hoặc đính kèm ảnh',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    const message = await this.conversationService.sendMessage(
      conversation,
      userId,
      content,
      idempotencyKey,
      attachment,
    );

    // On-write streak (docs/services/streak-service.md) — tự transaction riêng, khoá row streak
    // FOR UPDATE bên trong. Idempotent tự nhiên: replay message (retry idempotency) gọi lại đây
    // không tăng streak lần 2 (guard lastConfirmedDate !== today ở StreakService).
    try {
      const { milestoneHit } = await this.streakService.recordActivity(
        conversation,
        userId,
      );
      if (milestoneHit !== null) {
        const streakEnvelope: RealtimeEnvelope<FriendStreakIncreasedEventData> =
          {
            event: RealtimeEvents.FriendStreakIncreased,
            data: { conversationId, currentStreak: milestoneHit },
          };
        await Promise.all(
          [userId, partnerId].map((uid) =>
            publishRealtimeEvent(this.redis, this.logger, uid, streakEnvelope),
          ),
        );
      }
    } catch (err) {
      // Streak là phụ — message đã gửi thành công không được rollback vì lỗi tính streak.
      this.logger.error(
        `Tính streak cho conversation ${conversationId} lỗi (bỏ qua, message vẫn gửi thành công): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    const envelope: RealtimeEnvelope<FriendMessageEventData> = {
      event: RealtimeEvents.FriendMessage,
      data: {
        conversationId,
        messageId: message.id,
        senderUserId: message.senderUserId,
        content: message.content,
        attachment: message.attachment,
        sentAt: message.createdAt.toISOString(),
      },
    };
    await Promise.all(
      [userId, partnerId].map((uid) =>
        publishRealtimeEvent(this.redis, this.logger, uid, envelope),
      ),
    );

    // In-app notification cho người nhận — Friend Chat KHÔNG ẩn danh nên lộ senderUserId là
    // ĐÚNG (khác Soul Match, docs/services/notification-service.md § 3). Tự transaction riêng
    // vì message đã persist xong (không dùng chung transaction — friend-service.md), best-effort:
    // lỗi ở đây KHÔNG được làm fail luồng gửi tin nhắn đã thành công.
    // Người nhận đã mute hội thoại → bỏ qua cả in-app lẫn push; message + realtime + unread
    // vẫn hoạt động bình thường (mute chỉ tắt kênh thông báo).
    try {
      const partnerState = await this.memberStateRepo.findOne({
        where: { conversationId, userId: partnerId },
      });
      if (partnerState?.mutedAt != null) return message;
      const notification = await this.notificationService.create({
        userId: partnerId,
        type: NotificationType.FriendMessage,
        payload: {
          conversationId,
          senderUserId: userId,
          preview: message.content,
        },
      });
      await this.notificationService.sendPush(notification);
    } catch (err) {
      this.logger.warn(
        `Tạo notification friend_message lỗi (bỏ qua, message vẫn gửi thành công): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    return message;
  }

  // ---------- nội bộ ----------

  /** Tồn tại + caller là thành viên — gộp 404 (docs/10 § 10.1.D, cùng pattern Soul Match/Calling). */
  private async getConversationForMember(
    userId: string,
    conversationId: string,
  ): Promise<Conversation> {
    const conversation =
      await this.conversationService.findById(conversationId);
    if (
      !conversation ||
      (conversation.userLowId !== userId && conversation.userHighId !== userId)
    ) {
      throw new DomainException(
        FriendErrors.CONVERSATION_NOT_FOUND,
        'Không tìm thấy conversation',
        HttpStatus.NOT_FOUND,
      );
    }
    return conversation;
  }
}
