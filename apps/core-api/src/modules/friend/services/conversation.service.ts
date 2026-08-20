import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  buildCursorPage,
  decodeCursor,
  isValidSeqCursor,
} from '@litmatch/common-dtos';
import { DomainException } from '@litmatch/common-exceptions';
import { Repository } from 'typeorm';

import { canonicalPair } from '../../../common/entities/canonical-pair';
import { isUniqueViolation } from '../../../database/postgres-errors';
import { messageIdempotencyKey } from '../friend.constants';
import { FriendErrors } from '../friend.errors';
import { Conversation } from '../entities/conversation.entity';
import { Message } from '../entities/message.entity';

import type { CursorPage } from '@litmatch/common-dtos';
import type { MessageAttachment } from '../entities/message.entity';

export interface ConversationListEntry {
  partnerId: string;
  conversationId: string;
  relationshipSince: Date;
  lastMessageAt: Date | null;
  unreadCount: number;
  lastMessagePreview: string | null;
  muted: boolean;
  isFriend: boolean;
  canCall: boolean;
}

const CONVERSATION_LIST_READ_LIMIT = 500;

/**
 * Sub-service nghiệp vụ Conversation/Message (docs/05 § 5.3 services/) — chỉ FriendService
 * (facade) gọi, không export ra ngoài module. Guard membership/tồn tại nằm ở FriendService;
 * ở đây thuần thao tác dữ liệu theo conversationId đã được xác nhận hợp lệ.
 */
@Injectable()
export class ConversationService {
  constructor(
    @InjectRepository(Conversation)
    private readonly conversationRepo: Repository<Conversation>,
    @InjectRepository(Message)
    private readonly messageRepo: Repository<Message>,
  ) {}

  /** Tìm conversation theo cặp canonical; profile chat cũng có thể tạo trước Friendship. */
  async findByPair(
    userAId: string,
    userBId: string,
  ): Promise<Conversation | null> {
    const [userLowId, userHighId] = canonicalPair(userAId, userBId);
    return this.conversationRepo.findOneBy({ userLowId, userHighId });
  }

  async findById(id: string): Promise<Conversation | null> {
    return this.conversationRepo.findOneBy({ id });
  }

  /**
   * Danh sách mọi conversation mà caller là thành viên. Friendship chỉ là metadata;
   * chat trực tiếp từ profile cũng phải xuất hiện trong inbox. `canCall` chỉ true khi cả hai
   * follow nhau, được derive lại từ DB ở mỗi lần đọc.
   */
  async listForUser(userId: string): Promise<ConversationListEntry[]> {
    const rows = await this.conversationRepo
      .createQueryBuilder('c')
      .leftJoin(
        'friendships',
        'f',
        'f.user_low_id = c.user_low_id AND f.user_high_id = c.user_high_id',
      )
      .leftJoin(
        'conversation_member_states',
        's',
        's.conversation_id = c.id AND s.user_id = :userId',
        { userId },
      )
      .leftJoin(
        'profile_follows',
        'out_follow',
        'out_follow.follower_user_id = :userId AND out_follow.followee_user_id = CASE WHEN c.user_low_id = :userId THEN c.user_high_id ELSE c.user_low_id END AND out_follow.active = true',
        { userId },
      )
      .leftJoin(
        'profile_follows',
        'in_follow',
        'in_follow.follower_user_id = CASE WHEN c.user_low_id = :userId THEN c.user_high_id ELSE c.user_low_id END AND in_follow.followee_user_id = :userId AND in_follow.active = true',
        { userId },
      )
      .select([
        'c.user_low_id AS user_low_id',
        'c.user_high_id AS user_high_id',
        'c.id AS conversation_id',
        'COALESCE(f.created_at, c.created_at) AS relationship_since',
        'c.last_message_at AS last_message_at',
        's.muted_at IS NOT NULL AS muted',
        'f.user_low_id IS NOT NULL AS is_friend',
        '(out_follow.follower_user_id IS NOT NULL AND in_follow.follower_user_id IS NOT NULL) AS can_call',
      ])
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
      .where('c.user_low_id = :userId OR c.user_high_id = :userId', { userId })
      .orderBy('c.last_message_at', 'DESC', 'NULLS LAST')
      .addOrderBy('c.created_at', 'DESC')
      .take(CONVERSATION_LIST_READ_LIMIT)
      .getRawMany<{
        user_low_id: string;
        user_high_id: string;
        conversation_id: string;
        relationship_since: Date;
        last_message_at: Date | null;
        muted: boolean;
        is_friend: boolean;
        can_call: boolean | string;
        unread_count: string;
        last_message_preview: string | null;
      }>();

    return rows.map((row) => ({
      partnerId:
        row.user_low_id === userId ? row.user_high_id : row.user_low_id,
      conversationId: row.conversation_id,
      relationshipSince: row.relationship_since,
      lastMessageAt: row.last_message_at,
      unreadCount: Number(row.unread_count),
      lastMessagePreview: row.last_message_preview,
      muted: row.muted,
      isFriend: row.is_friend,
      canCall: row.can_call === true || row.can_call === 'true',
    }));
  }

  /**
   * Gửi message — Idempotency-Key bắt buộc, unique DB (docs/05 § 5.10). `attachment` CHỈ set bởi
   * lời gọi nội bộ qua DI (vd Feed reply-to-story) — HTTP controller không có field này trong
   * DTO nên client không tự gắn attachment tuỳ ý được (docs/10 § 10.0.B).
   */
  async sendMessage(
    conversation: Conversation,
    senderUserId: string,
    content: string,
    idempotencyKey: string,
    attachment: MessageAttachment | null = null,
  ): Promise<Message> {
    const prefixedKey = messageIdempotencyKey(senderUserId, idempotencyKey);
    let message: Message;
    try {
      message = await this.messageRepo.save(
        this.messageRepo.create({
          conversationId: conversation.id,
          senderUserId,
          content,
          idempotencyKey: prefixedKey,
          attachment,
        }),
      );
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      const existing = await this.messageRepo.findOneBy({
        idempotencyKey: prefixedKey,
      });
      if (
        existing &&
        existing.conversationId === conversation.id &&
        existing.content === content
      ) {
        return existing; // replay — client retry sau timeout mạng
      }
      throw new DomainException(
        FriendErrors.MESSAGE_IDEMPOTENCY_CONFLICT,
        'Idempotency-Key đã dùng cho 1 message khác nội dung',
        HttpStatus.CONFLICT,
      );
    }
    // chỉ để sort GET /friends — không phải nguồn sự thật gì khác, không cần cùng transaction
    await this.conversationRepo.update(
      { id: conversation.id },
      { lastMessageAt: message.createdAt },
    );
    return message;
  }

  async listMessages(
    conversationId: string,
    limit: number,
    cursor?: string,
  ): Promise<CursorPage<Message>> {
    let afterSeq = '0';
    if (cursor) {
      const payload = decodeCursor<{ seq?: unknown }>(cursor);
      if (!isValidSeqCursor(payload)) {
        throw new DomainException(
          FriendErrors.CURSOR_INVALID,
          'Cursor không hợp lệ',
          HttpStatus.BAD_REQUEST,
        );
      }
      afterSeq = payload.seq;
    }

    const rows = await this.messageRepo
      .createQueryBuilder('m')
      .where('m.conversationId = :conversationId', { conversationId })
      .andWhere('m.seq > :afterSeq', { afterSeq })
      .orderBy('m.seq', 'ASC')
      .take(limit + 1)
      .getMany();
    return buildCursorPage(rows, limit, (last) => ({ seq: last.seq }));
  }
}
