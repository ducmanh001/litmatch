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

  /** Tồn tại ⟺ 2 user là bạn (bất biến tạo cùng Friendship — spec § 1). */
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
