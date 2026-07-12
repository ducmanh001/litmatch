import { DomainException } from '@litmatch/common-exceptions';
import { encodeCursor } from '@litmatch/common-dtos';

import { ConversationService } from './conversation.service';
import { FriendErrors } from '../friend.errors';
import { Conversation } from '../entities/conversation.entity';
import { Message } from '../entities/message.entity';

import type { Repository } from 'typeorm';

const USER_A = 'user-a';
const USER_B = 'user-b';

function makeConversation(overrides: Partial<Conversation> = {}): Conversation {
  return Object.assign(new Conversation(), {
    id: 'conv-1',
    userLowId: USER_A,
    userHighId: USER_B,
    lastMessageAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

function uniqueViolation(): Error {
  return Object.assign(new Error('duplicate key'), { code: '23505' });
}

describe('ConversationService (unit — mock repo)', () => {
  let conversationRepo: {
    findOneBy: jest.Mock;
    update: jest.Mock;
  };
  let messageRepo: {
    save: jest.Mock;
    create: jest.Mock;
    findOneBy: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let service: ConversationService;

  beforeEach(() => {
    conversationRepo = {
      findOneBy: jest.fn(async () => null),
      update: jest.fn(async () => undefined),
    };
    messageRepo = {
      save: jest.fn(async (m) =>
        Object.assign(m, {
          id: (m as { id?: string }).id ?? 'msg-new',
          createdAt: (m as { createdAt?: Date }).createdAt ?? new Date(),
        }),
      ),
      create: jest.fn((input) => Object.assign(new Message(), input)),
      findOneBy: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    service = new ConversationService(
      conversationRepo as unknown as Repository<Conversation>,
      messageRepo as unknown as Repository<Message>,
    );
  });

  function expectDomainError(err: unknown, code: string): void {
    expect(err).toBeInstanceOf(DomainException);
    expect((err as DomainException).code).toBe(code);
  }

  describe('findByPair', () => {
    it('chuẩn hoá cặp (low, high) trước khi query — thứ tự tham số không quan trọng', async () => {
      await service.findByPair(USER_B, USER_A);
      expect(conversationRepo.findOneBy).toHaveBeenCalledWith({
        userLowId: USER_A,
        userHighId: USER_B,
      });
    });
  });

  describe('sendMessage', () => {
    const conversation = makeConversation();

    it('lưu message mới với idempotency key prefix theo user + bump lastMessageAt', async () => {
      const message = await service.sendMessage(
        conversation,
        USER_A,
        'hello',
        'k1',
      );
      expect(message.idempotencyKey).toBe('friend:msg:user-a:k1');
      expect(message.senderUserId).toBe(USER_A);
      expect(conversationRepo.update).toHaveBeenCalledWith(
        { id: conversation.id },
        { lastMessageAt: message.createdAt },
      );
    });

    it('retry cùng key cùng nội dung → replay message cũ, không nhân đôi, không bump lastMessageAt lại', async () => {
      const existing = Object.assign(new Message(), {
        id: 'msg-1',
        conversationId: conversation.id,
        senderUserId: USER_A,
        content: 'hello',
        idempotencyKey: 'friend:msg:user-a:k1',
      });
      messageRepo.save.mockRejectedValue(uniqueViolation());
      messageRepo.findOneBy.mockResolvedValue(existing);
      const result = await service.sendMessage(
        conversation,
        USER_A,
        'hello',
        'k1',
      );
      expect(result).toBe(existing);
      expect(conversationRepo.update).not.toHaveBeenCalled();
    });

    it('cùng key nhưng nội dung khác → 409 MESSAGE_IDEMPOTENCY_CONFLICT', async () => {
      messageRepo.save.mockRejectedValue(uniqueViolation());
      messageRepo.findOneBy.mockResolvedValue(
        Object.assign(new Message(), {
          conversationId: conversation.id,
          content: 'khác',
          idempotencyKey: 'friend:msg:user-a:k1',
        }),
      );
      const err = await service
        .sendMessage(conversation, USER_A, 'hello', 'k1')
        .catch((e) => e);
      expectDomainError(err, FriendErrors.MESSAGE_IDEMPOTENCY_CONFLICT);
    });
  });

  describe('listMessages', () => {
    it('cursor hỏng → 400 CURSOR_INVALID, không chạm query builder', async () => {
      const err = await service
        .listMessages('conv-1', 20, 'not-a-cursor')
        .catch((e) => e);
      expectDomainError(err, FriendErrors.CURSOR_INVALID);
      expect(messageRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('cursor hợp lệ nhưng seq không phải số → 400 CURSOR_INVALID', async () => {
      const err = await service
        .listMessages('conv-1', 20, encodeCursor({ seq: 'abc' }))
        .catch((e) => e);
      expectDomainError(err, FriendErrors.CURSOR_INVALID);
    });
  });
});
