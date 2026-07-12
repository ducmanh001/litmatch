import { DomainException } from '@litmatch/common-exceptions';

import { FriendService, canonicalPair } from './friend.service';
import { FriendErrors } from './friend.errors';
import { Conversation } from './entities/conversation.entity';
import { Message } from './entities/message.entity';
import { FriendshipSource } from './entities/friendship.entity';

import type { ConfigService } from '@nestjs/config';
import type { EntityManager, Repository } from 'typeorm';

import type { CoreApiEnv } from '../../config/env.validation';
import type { Friendship } from './entities/friendship.entity';
import type { ConversationService } from './services/conversation.service';

const USER_A = 'user-a';
const USER_B = 'user-b';

const CONFIG: Record<string, unknown> = { FRIEND_MESSAGE_MAX_LENGTH: 20 };
const configStub = {
  getOrThrow: (key: string) => {
    if (!(key in CONFIG)) throw new Error(`missing config ${key}`);
    return CONFIG[key];
  },
} as unknown as ConfigService<CoreApiEnv, true>;

function makeConversation(overrides: Partial<Conversation> = {}): Conversation {
  return Object.assign(new Conversation(), {
    id: 'conv-1',
    userLowId: USER_A,
    userHighId: USER_B,
    lastMessageAt: null,
    ...overrides,
  });
}

describe('FriendService (unit — mock repo/conversationService/redis)', () => {
  let friendshipRepo: { exists: jest.Mock; createQueryBuilder: jest.Mock };
  let conversationService: {
    findByPair: jest.Mock;
    findById: jest.Mock;
    sendMessage: jest.Mock;
    listMessages: jest.Mock;
  };
  let redis: { publish: jest.Mock };
  let service: FriendService;

  beforeEach(() => {
    friendshipRepo = {
      exists: jest.fn(async () => true),
      createQueryBuilder: jest.fn(),
    };
    conversationService = {
      findByPair: jest.fn(async () => makeConversation()),
      findById: jest.fn(async () => makeConversation()),
      sendMessage: jest.fn(async (_conv, senderUserId, content) =>
        Object.assign(new Message(), {
          id: 'msg-1',
          conversationId: 'conv-1',
          senderUserId,
          content,
          createdAt: new Date(),
        }),
      ),
      listMessages: jest.fn(async () => ({
        items: [],
        meta: { nextCursor: null },
      })),
    };
    redis = { publish: jest.fn(async () => 1) };
    service = new FriendService(
      friendshipRepo as unknown as Repository<Friendship>,
      conversationService as unknown as ConversationService,
      configStub,
      redis as never,
    );
  });

  function expectDomainError(err: unknown, code: string): void {
    expect(err).toBeInstanceOf(DomainException);
    expect((err as DomainException).code).toBe(code);
  }

  describe('canonicalPair', () => {
    it('luôn trả (low, high) bất kể thứ tự tham số', () => {
      expect(canonicalPair(USER_A, USER_B)).toEqual([USER_A, USER_B]);
      expect(canonicalPair(USER_B, USER_A)).toEqual([USER_A, USER_B]);
    });
  });

  describe('ensureFriendship', () => {
    it('tự kết bạn với chính mình → ném lỗi (dữ liệu session hỏng)', async () => {
      const manager = {} as EntityManager;
      await expect(
        service.ensureFriendship(
          manager,
          USER_A,
          USER_A,
          FriendshipSource.SoulMatch,
        ),
      ).rejects.toThrow(/chính mình/);
    });

    it('insert cả Friendship VÀ Conversation cùng transaction (manager truyền vào)', async () => {
      const execute = jest.fn(async () => ({ raw: [{ id: 'x' }] }));
      const orIgnore = jest.fn(() => ({ execute }));
      const values = jest.fn(() => ({ orIgnore }));
      const into = jest.fn(() => ({ values }));
      const insert = jest.fn(() => ({ into }));
      const manager = {
        createQueryBuilder: jest.fn(() => ({ insert })),
      } as unknown as EntityManager;

      const result = await service.ensureFriendship(
        manager,
        USER_A,
        USER_B,
        FriendshipSource.SoulMatch,
      );
      expect(result.created).toBe(true);
      expect(manager.createQueryBuilder).toHaveBeenCalledTimes(2); // Friendship + Conversation
    });

    it('replay (đã tồn tại) → created=false', async () => {
      const execute = jest.fn(async () => ({ raw: [] }));
      const manager = {
        createQueryBuilder: jest.fn(() => ({
          insert: () => ({
            into: () => ({ values: () => ({ orIgnore: () => ({ execute }) }) }),
          }),
        })),
      } as unknown as EntityManager;
      const result = await service.ensureFriendship(
        manager,
        USER_A,
        USER_B,
        FriendshipSource.SoulMatch,
      );
      expect(result.created).toBe(false);
    });
  });

  describe('areFriends', () => {
    it('tự so với chính mình → false, không query DB', async () => {
      expect(await service.areFriends(USER_A, USER_A)).toBe(false);
      expect(friendshipRepo.exists).not.toHaveBeenCalled();
    });

    it('query theo cặp canonical', async () => {
      await service.areFriends(USER_B, USER_A);
      expect(friendshipRepo.exists).toHaveBeenCalledWith({
        where: { userLowId: USER_A, userHighId: USER_B },
      });
    });
  });

  describe('getConversationWithFriend', () => {
    it('tự kết bạn với chính mình → 404 NOT_FRIEND', async () => {
      const err = await service
        .getConversationWithFriend(USER_A, USER_A)
        .catch((e) => e);
      expectDomainError(err, FriendErrors.NOT_FRIEND);
      expect(conversationService.findByPair).not.toHaveBeenCalled();
    });

    it('không phải bạn (findByPair null) → 404 NOT_FRIEND', async () => {
      conversationService.findByPair.mockResolvedValue(null);
      const err = await service
        .getConversationWithFriend(USER_A, USER_B)
        .catch((e) => e);
      expectDomainError(err, FriendErrors.NOT_FRIEND);
    });

    it('là bạn → trả conversation', async () => {
      const conversation = await service.getConversationWithFriend(
        USER_A,
        USER_B,
      );
      expect(conversation.id).toBe('conv-1');
    });
  });

  describe('listMessages — guard membership trước khi delegate', () => {
    it('conversation không tồn tại → 404 CONVERSATION_NOT_FOUND', async () => {
      conversationService.findById.mockResolvedValue(null);
      const err = await service
        .listMessages(USER_A, 'conv-1', 20)
        .catch((e) => e);
      expectDomainError(err, FriendErrors.CONVERSATION_NOT_FOUND);
      expect(conversationService.listMessages).not.toHaveBeenCalled();
    });

    it('không phải thành viên → CÙNG 404 (chống oracle, docs/10 § 10.1.D)', async () => {
      conversationService.findById.mockResolvedValue(
        makeConversation({ userLowId: 'x', userHighId: 'y' }),
      );
      const err = await service
        .listMessages(USER_A, 'conv-1', 20)
        .catch((e) => e);
      expectDomainError(err, FriendErrors.CONVERSATION_NOT_FOUND);
    });

    it('là thành viên → delegate ConversationService.listMessages', async () => {
      await service.listMessages(USER_A, 'conv-1', 20, 'cursor-x');
      expect(conversationService.listMessages).toHaveBeenCalledWith(
        'conv-1',
        20,
        'cursor-x',
      );
    });
  });

  describe('sendMessage', () => {
    it('không phải thành viên → 404 CONVERSATION_NOT_FOUND, không gửi', async () => {
      conversationService.findById.mockResolvedValue(
        makeConversation({ userLowId: 'x', userHighId: 'y' }),
      );
      const err = await service
        .sendMessage(USER_A, 'conv-1', 'hi', 'k1')
        .catch((e) => e);
      expectDomainError(err, FriendErrors.CONVERSATION_NOT_FOUND);
      expect(conversationService.sendMessage).not.toHaveBeenCalled();
    });

    it('vượt FRIEND_MESSAGE_MAX_LENGTH → 422 MESSAGE_TOO_LONG', async () => {
      const err = await service
        .sendMessage(USER_A, 'conv-1', 'x'.repeat(21), 'k1')
        .catch((e) => e);
      expectDomainError(err, FriendErrors.MESSAGE_TOO_LONG);
      expect(conversationService.sendMessage).not.toHaveBeenCalled();
    });

    it('thành công → publish friend.message cho CẢ 2, senderUserId KHÔNG ẩn danh', async () => {
      await service.sendMessage(USER_A, 'conv-1', 'xin chào', 'k1');
      expect(redis.publish).toHaveBeenCalledTimes(2);
      const calls = redis.publish.mock.calls.map(
        ([channel, raw]: [string, string]) => ({
          channel,
          envelope: JSON.parse(raw) as {
            event: string;
            data: { senderUserId: string; content: string };
          },
        }),
      );
      expect(calls.map((c) => c.channel).sort()).toEqual(
        [`realtime:user:${USER_A}`, `realtime:user:${USER_B}`].sort(),
      );
      for (const c of calls) {
        expect(c.envelope.event).toBe('friend.message');
        expect(c.envelope.data.senderUserId).toBe(USER_A); // không che, khác Soul Match
        expect(c.envelope.data.content).toBe('xin chào');
      }
    });
  });
});
