import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { RealtimeEvents } from '@litmatch/common-dtos';
import { DomainException } from '@litmatch/common-exceptions';
import { EntityManager, Repository } from 'typeorm';

import { publishRealtimeEvent } from '../../common/realtime/publish-realtime';
import { FriendErrors } from './friend.errors';
import { Conversation } from './entities/conversation.entity';
import { Friendship, FriendshipSource } from './entities/friendship.entity';
import { Message } from './entities/message.entity';
import { FRIEND_REDIS } from './redis/friend-redis.provider';
import { ConversationService } from './services/conversation.service';

import type {
  CursorPage,
  FriendMessageEventData,
  RealtimeEnvelope,
} from '@litmatch/common-dtos';
import type Redis from 'ioredis';
import type { CoreApiEnv } from '../../config/env.validation';

/** Kết quả tạo quan hệ — `created=false` nghĩa là cặp đã là bạn từ trước (idempotent). */
export interface EnsureFriendshipResult {
  created: boolean;
}

export interface FriendListEntry {
  partnerId: string;
  conversationId: string;
  friendSince: Date;
  lastMessageAt: Date | null;
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
    private readonly conversationService: ConversationService,
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

  /** Danh sách bạn sort theo chat gần nhất (bạn mới, chưa chat lần nào → sort theo friendSince). */
  async listFriends(userId: string): Promise<FriendListEntry[]> {
    const rows = await this.friendshipRepo
      .createQueryBuilder('f')
      .innerJoin(
        'conversations',
        'c',
        'c.user_low_id = f.user_low_id AND c.user_high_id = f.user_high_id',
      )
      .select([
        'f.user_low_id AS user_low_id',
        'f.user_high_id AS user_high_id',
        'f.created_at AS friend_since',
        'c.id AS conversation_id',
        'c.last_message_at AS last_message_at',
      ])
      .where('f.user_low_id = :userId OR f.user_high_id = :userId', { userId })
      .orderBy('c.last_message_at', 'DESC', 'NULLS LAST')
      .addOrderBy('f.created_at', 'DESC')
      .getRawMany<{
        user_low_id: string;
        user_high_id: string;
        friend_since: Date;
        conversation_id: string;
        last_message_at: Date | null;
      }>();

    return rows.map((r) => ({
      partnerId: r.user_low_id === userId ? r.user_high_id : r.user_low_id,
      conversationId: r.conversation_id,
      friendSince: r.friend_since,
      lastMessageAt: r.last_message_at,
    }));
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

  /** Gửi message — guard membership + validate độ dài + publish realtime sau persist. */
  async sendMessage(
    userId: string,
    conversationId: string,
    content: string,
    idempotencyKey: string,
  ): Promise<Message> {
    const conversation = await this.getConversationForMember(
      userId,
      conversationId,
    );
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

    const message = await this.conversationService.sendMessage(
      conversation,
      userId,
      content,
      idempotencyKey,
    );

    const partnerId =
      conversation.userLowId === userId
        ? conversation.userHighId
        : conversation.userLowId;
    const envelope: RealtimeEnvelope<FriendMessageEventData> = {
      event: RealtimeEvents.FriendMessage,
      data: {
        conversationId,
        messageId: message.id,
        senderUserId: message.senderUserId,
        content: message.content,
        sentAt: message.createdAt.toISOString(),
      },
    };
    await Promise.all(
      [userId, partnerId].map((uid) =>
        publishRealtimeEvent(this.redis, this.logger, uid, envelope),
      ),
    );
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

/** Chuẩn hoá cặp 2 chiều về (low, high) theo so sánh chuỗi uuid — 1 quan hệ chỉ có 1 dòng. */
export function canonicalPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}
