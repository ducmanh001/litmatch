import { DomainException } from '@litmatch/common-exceptions';

import { StoryService } from './story.service';
import { FeedErrors } from '../feed.errors';
import { Story, StoryAudience } from '../entities/story.entity';

import type { ConfigService } from '@nestjs/config';
import type { Repository } from 'typeorm';
import type { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import type { CoreApiEnv } from '../../../config/env.validation';
import type { FriendService } from '../../friend';
import type { SafetyService } from '../../safety';
import type { StoryView } from '../entities/story-view.entity';

const me: AuthenticatedUser = {
  userId: 'user-me',
  isGuest: false,
  role: 'user',
};
const guest: AuthenticatedUser = {
  userId: 'user-guest',
  isGuest: true,
  role: 'user',
};

const CONFIG: Record<string, unknown> = { STORY_TTL_HOURS: 24 };
const configStub = {
  getOrThrow: (key: string) => {
    if (!(key in CONFIG)) throw new Error(`missing config ${key}`);
    return CONFIG[key];
  },
} as unknown as ConfigService<CoreApiEnv, true>;

function makeStory(overrides: Partial<Story> = {}): Story {
  return Object.assign(new Story(), {
    id: 'story-1',
    authorUserId: 'other',
    mediaUrl: 'https://cdn.example/a.jpg',
    caption: null,
    audience: StoryAudience.Friends,
    expiresAt: new Date(Date.now() + 3600_000),
    idempotencyKey: 'feed:story:other:key-1',
    createdAt: new Date(),
    ...overrides,
  });
}

describe('StoryService (unit — mock repo/FriendService/SafetyService)', () => {
  let storyRepo: jest.Mocked<
    Pick<
      Repository<Story>,
      'save' | 'create' | 'findOneBy' | 'createQueryBuilder'
    >
  >;
  let viewRepo: jest.Mocked<
    Pick<Repository<StoryView>, 'save' | 'create' | 'findBy'>
  >;
  let friendService: {
    areFriends: jest.Mock;
    listFriendIds: jest.Mock;
    getConversationWithFriend: jest.Mock;
    sendMessage: jest.Mock;
  };
  let safetyService: { isBlocked: jest.Mock; getBlockedUserIds: jest.Mock };
  let service: StoryService;

  beforeEach(() => {
    storyRepo = {
      save: jest.fn(async (s) => s as Story),
      create: jest.fn((input) => Object.assign(new Story(), input)),
      findOneBy: jest.fn(async () => makeStory()),
      createQueryBuilder: jest.fn(),
    } as never;
    viewRepo = {
      save: jest.fn(async (v) => v),
      create: jest.fn((input) => input),
      findBy: jest.fn(async () => []),
    } as never;
    friendService = {
      areFriends: jest.fn(async () => true),
      listFriendIds: jest.fn(async () => []),
      getConversationWithFriend: jest.fn(async () => ({ id: 'conv-1' })),
      sendMessage: jest.fn(async () => ({ id: 'msg-1' })),
    };
    safetyService = {
      isBlocked: jest.fn(async () => false),
      getBlockedUserIds: jest.fn(async () => []),
    };
    service = new StoryService(
      storyRepo as unknown as Repository<Story>,
      viewRepo as unknown as Repository<StoryView>,
      friendService as unknown as FriendService,
      safetyService as unknown as SafetyService,
      configStub,
    );
  });

  function expectDomainError(err: unknown, code: string): void {
    expect(err).toBeInstanceOf(DomainException);
    expect((err as DomainException).code).toBe(code);
  }

  describe('createStory', () => {
    it('guest bị chặn', async () => {
      expectDomainError(
        await service
          .createStory(guest, { mediaUrl: 'https://x' }, 'k1')
          .catch((e) => e),
        FeedErrors.GUEST_FORBIDDEN,
      );
    });

    it('thiếu mediaUrl → 422', async () => {
      expectDomainError(
        await service.createStory(me, { mediaUrl: '' }, 'k1').catch((e) => e),
        FeedErrors.STORY_MEDIA_URL_REQUIRED,
      );
    });

    it('tạo story audience mặc định friends, expiresAt = now + STORY_TTL_HOURS', async () => {
      const before = Date.now();
      const story = await service.createStory(
        me,
        { mediaUrl: 'https://cdn.example/x.jpg' },
        'k1',
      );
      expect(story.authorUserId).toBe(me.userId);
      expect(story.audience).toBe(StoryAudience.Friends);
      const ttlMs = story.expiresAt.getTime() - before;
      expect(ttlMs).toBeGreaterThan(23 * 3600 * 1000);
      expect(ttlMs).toBeLessThan(25 * 3600 * 1000);
    });

    it('idempotency-key trùng cùng mediaUrl → trả lại story cũ', async () => {
      storyRepo.save.mockRejectedValueOnce(
        Object.assign(new Error('duplicate'), { code: '23505' }),
      );
      storyRepo.findOneBy.mockResolvedValueOnce(
        makeStory({ mediaUrl: 'https://cdn.example/x.jpg' }),
      );
      const story = await service.createStory(
        me,
        { mediaUrl: 'https://cdn.example/x.jpg' },
        'k1',
      );
      expect(story.id).toBe('story-1');
    });
  });

  describe('getStoryOrThrow', () => {
    it('không tồn tại → 404', async () => {
      storyRepo.findOneBy.mockResolvedValue(null);
      expectDomainError(
        await service.getStoryOrThrow(me, 'x').catch((e) => e),
        FeedErrors.STORY_NOT_FOUND,
      );
    });

    it('đã hết hạn → CÙNG 404', async () => {
      storyRepo.findOneBy.mockResolvedValue(
        makeStory({ expiresAt: new Date(Date.now() - 1000) }),
      );
      expectDomainError(
        await service.getStoryOrThrow(me, 'story-1').catch((e) => e),
        FeedErrors.STORY_NOT_FOUND,
      );
    });

    it('bị block 2 chiều → CÙNG 404', async () => {
      safetyService.isBlocked.mockResolvedValueOnce(true);
      expectDomainError(
        await service.getStoryOrThrow(me, 'story-1').catch((e) => e),
        FeedErrors.STORY_NOT_FOUND,
      );
    });

    it('audience=friends, không phải bạn → CÙNG 404', async () => {
      friendService.areFriends.mockResolvedValue(false);
      expectDomainError(
        await service.getStoryOrThrow(me, 'story-1').catch((e) => e),
        FeedErrors.STORY_NOT_FOUND,
      );
    });

    it('audience=public, không phải bạn vẫn xem được', async () => {
      storyRepo.findOneBy.mockResolvedValue(
        makeStory({ audience: StoryAudience.Public }),
      );
      friendService.areFriends.mockResolvedValue(false);
      const story = await service.getStoryOrThrow(me, 'story-1');
      expect(story.id).toBe('story-1');
    });

    it('tác giả tự xem → không check block/audience', async () => {
      storyRepo.findOneBy.mockResolvedValue(
        makeStory({ authorUserId: me.userId }),
      );
      await service.getStoryOrThrow(me, 'story-1');
      expect(safetyService.isBlocked).not.toHaveBeenCalled();
      expect(friendService.areFriends).not.toHaveBeenCalled();
    });
  });

  describe('viewStory', () => {
    it('tự xem story mình → không tạo StoryView', async () => {
      storyRepo.findOneBy.mockResolvedValue(
        makeStory({ authorUserId: me.userId }),
      );
      await service.viewStory(me, 'story-1');
      expect(viewRepo.save).not.toHaveBeenCalled();
    });

    it('xem story người khác → tạo StoryView', async () => {
      await service.viewStory(me, 'story-1');
      expect(viewRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ storyId: 'story-1', viewerId: me.userId }),
      );
    });

    it('xem lại lần 2 (unique violation) → idempotent, không throw', async () => {
      viewRepo.save.mockRejectedValueOnce(
        Object.assign(new Error('duplicate'), { code: '23505' }),
      );
      await expect(service.viewStory(me, 'story-1')).resolves.toBeDefined();
    });
  });

  describe('listViewers', () => {
    it('không phải tác giả → 404', async () => {
      storyRepo.findOneBy.mockResolvedValue(
        makeStory({ authorUserId: 'other' }),
      );
      expectDomainError(
        await service.listViewers(me, 'story-1').catch((e) => e),
        FeedErrors.STORY_NOT_FOUND,
      );
    });

    it('là tác giả → trả viewerIds, lọc bỏ người đang bị chính mình block', async () => {
      storyRepo.findOneBy.mockResolvedValue(
        makeStory({ authorUserId: me.userId }),
      );
      viewRepo.findBy.mockResolvedValue([
        { viewerId: 'v1' },
        { viewerId: 'v2' },
      ] as never);
      safetyService.getBlockedUserIds.mockResolvedValue(['v2']);
      const viewerIds = await service.listViewers(me, 'story-1');
      expect(viewerIds).toEqual(['v1']);
    });
  });

  describe('replyToStory', () => {
    it('là bạn → gửi message với attachment snapshot mediaUrl', async () => {
      await service.replyToStory(me, 'story-1', 'so cute', 'k1');
      expect(friendService.sendMessage).toHaveBeenCalledWith(
        me.userId,
        'conv-1',
        'so cute',
        'k1',
        {
          kind: 'story_reply',
          payload: {
            storyId: 'story-1',
            mediaUrl: 'https://cdn.example/a.jpg',
          },
        },
      );
    });

    it('không phải bạn (audience public từ người lạ) → 403, không lộ mã lỗi nội bộ Friend', async () => {
      storyRepo.findOneBy.mockResolvedValue(
        makeStory({ audience: StoryAudience.Public }),
      );
      friendService.areFriends.mockResolvedValue(false);
      friendService.getConversationWithFriend.mockRejectedValue(
        new DomainException('FRIEND_NOT_FRIEND', 'not friend', 404),
      );
      expectDomainError(
        await service.replyToStory(me, 'story-1', 'hi', 'k1').catch((e) => e),
        FeedErrors.STORY_REPLY_REQUIRES_FRIENDSHIP,
      );
    });
  });

  describe('getRing', () => {
    it('gộp self + friendIds, loại người đang block, query đúng authorIds', async () => {
      friendService.listFriendIds.mockResolvedValue(['friend-1']);
      safetyService.getBlockedUserIds.mockResolvedValue(['friend-1']);
      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn(async () => []),
      };
      storyRepo.createQueryBuilder.mockReturnValue(qb as never);
      await service.getRing(me);
      expect(qb.where).toHaveBeenCalledWith(
        's.authorUserId IN (:...authorIds)',
        {
          authorIds: [me.userId], // friend-1 bị loại vì đang block
        },
      );
    });

    it('không còn ai (tự mình cũng bị lọc — trường hợp lý thuyết) → trả rỗng, không query DB', async () => {
      safetyService.getBlockedUserIds.mockResolvedValue([me.userId]);
      const result = await service.getRing(me);
      expect(result).toEqual([]);
      expect(storyRepo.createQueryBuilder).not.toHaveBeenCalled();
    });
  });
});
