import { DomainException } from '@litmatch/common-exceptions';

import { FeedService } from './feed.service';
import { FeedErrors } from './feed.errors';
import { Comment } from './entities/comment.entity';
import { Post } from './entities/post.entity';
import { Reaction } from './entities/reaction.entity';

import type { EntityManager, Repository } from 'typeorm';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import type { SafetyService } from '../safety';

const me: AuthenticatedUser = { userId: 'user-me', isGuest: false };
const guest: AuthenticatedUser = { userId: 'user-guest', isGuest: true };

function makePost(overrides: Partial<Post> = {}): Post {
  return Object.assign(new Post(), {
    id: 'post-1',
    seq: '1',
    authorUserId: me.userId,
    content: 'hello',
    imageUrl: null,
    likeCount: 0,
    commentCount: 0,
    deletedAt: null,
    createdAt: new Date('2026-07-13T00:00:00Z'),
    ...overrides,
  });
}

describe('FeedService (unit — mock repo/safetyService)', () => {
  let postRepo: jest.Mocked<
    Pick<
      Repository<Post>,
      'save' | 'create' | 'findOneBy' | 'update' | 'createQueryBuilder'
    >
  >;
  let commentRepo: jest.Mocked<
    Pick<Repository<Comment>, 'findOneBy' | 'createQueryBuilder'>
  >;
  let reactionRepo: { exists: jest.Mock };
  let safetyService: { getBlockedUserIds: jest.Mock; isBlocked: jest.Mock };
  let notificationService: {
    createWithManager: jest.Mock;
    sendPush: jest.Mock;
  };
  let manager: {
    save: jest.Mock;
    create: jest.Mock;
    increment: jest.Mock;
    decrement: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  let dataSource: { transaction: jest.Mock };
  let service: FeedService;

  beforeEach(() => {
    postRepo = {
      save: jest.fn(async (p) => p as Post),
      create: jest.fn((input) => Object.assign(new Post(), input)),
      findOneBy: jest.fn(async () => makePost()),
      update: jest.fn(async () => ({
        affected: 1,
        raw: [],
        generatedMaps: [],
      })),
      createQueryBuilder: jest.fn(),
    } as never;
    commentRepo = {
      findOneBy: jest.fn(async () => null),
      createQueryBuilder: jest.fn(),
    } as never;
    reactionRepo = { exists: jest.fn(async () => false) };
    safetyService = {
      getBlockedUserIds: jest.fn(async () => []),
      isBlocked: jest.fn(async () => false),
    };
    notificationService = {
      createWithManager: jest.fn(async (_manager, input) => ({
        id: 'notif-1',
        ...input,
      })),
      sendPush: jest.fn(async () => undefined),
    };
    manager = {
      save: jest.fn(async (e) => e),
      create: jest.fn((Entity, input) =>
        Object.assign(Object.create(Entity.prototype), input),
      ),
      increment: jest.fn(async () => undefined),
      decrement: jest.fn(async () => undefined),
      update: jest.fn(async () => undefined),
      delete: jest.fn(async () => ({ affected: 1, raw: [] })),
    };
    dataSource = {
      transaction: jest.fn(async (cb: (m: EntityManager) => Promise<unknown>) =>
        cb(manager as unknown as EntityManager),
      ),
    };
    service = new FeedService(
      dataSource as never,
      postRepo as unknown as Repository<Post>,
      commentRepo as unknown as Repository<Comment>,
      reactionRepo as unknown as Repository<Reaction>,
      safetyService as unknown as SafetyService,
      notificationService as never,
    );
  });

  function expectDomainError(err: unknown, code: string): void {
    expect(err).toBeInstanceOf(DomainException);
    expect((err as DomainException).code).toBe(code);
  }

  describe('createPost', () => {
    it('guest bị chặn, không đụng DB', async () => {
      expectDomainError(
        await service.createPost(guest, { content: 'hi' }).catch((e) => e),
        FeedErrors.GUEST_FORBIDDEN,
      );
      expect(postRepo.save).not.toHaveBeenCalled();
    });

    it('thiếu cả content lẫn imageUrl → 422', async () => {
      expectDomainError(
        await service.createPost(me, {}).catch((e) => e),
        FeedErrors.POST_CONTENT_REQUIRED,
      );
    });

    it('có content → tạo post đúng authorUserId', async () => {
      const post = await service.createPost(me, { content: 'xin chào' });
      expect(post.authorUserId).toBe(me.userId);
      expect(post.content).toBe('xin chào');
    });
  });

  describe('getPostOrThrow', () => {
    it('không tồn tại → 404 POST_NOT_FOUND', async () => {
      postRepo.findOneBy.mockResolvedValue(null);
      expectDomainError(
        await service.getPostOrThrow(me, 'x').catch((e) => e),
        FeedErrors.POST_NOT_FOUND,
      );
    });

    it('đã xoá mềm → CÙNG 404 POST_NOT_FOUND', async () => {
      postRepo.findOneBy.mockResolvedValue(makePost({ deletedAt: new Date() }));
      expectDomainError(
        await service.getPostOrThrow(me, 'post-1').catch((e) => e),
        FeedErrors.POST_NOT_FOUND,
      );
    });

    it('tác giả đang block/bị block với caller → CÙNG 404 (chống oracle)', async () => {
      postRepo.findOneBy.mockResolvedValue(makePost({ authorUserId: 'other' }));
      safetyService.isBlocked.mockResolvedValueOnce(true);
      expectDomainError(
        await service.getPostOrThrow(me, 'post-1').catch((e) => e),
        FeedErrors.POST_NOT_FOUND,
      );
    });

    it('caller chính là tác giả → không check block', async () => {
      postRepo.findOneBy.mockResolvedValue(
        makePost({ authorUserId: me.userId }),
      );
      await service.getPostOrThrow(me, 'post-1');
      expect(safetyService.isBlocked).not.toHaveBeenCalled();
    });
  });

  describe('listFeed', () => {
    it('lọc tác giả nằm trong getBlockedUserIds', async () => {
      safetyService.getBlockedUserIds.mockResolvedValue(['blocked-1']);
      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn(async () => []),
      };
      postRepo.createQueryBuilder.mockReturnValue(qb as never);
      await service.listFeed(me, { limit: 20 });
      expect(qb.andWhere).toHaveBeenCalledWith(
        'p.authorUserId NOT IN (:...blockedIds)',
        { blockedIds: ['blocked-1'] },
      );
    });

    it('cursor hỏng → 400 CURSOR_INVALID', async () => {
      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn(async () => []),
      };
      postRepo.createQueryBuilder.mockReturnValue(qb as never);
      expectDomainError(
        await service
          .listFeed(me, { limit: 20, cursor: 'not-base64-json' })
          .catch((e) => e),
        FeedErrors.CURSOR_INVALID,
      );
    });
  });

  describe('deletePost', () => {
    it('không phải tác giả → 403 (postId công khai, không cần 404 oracle)', async () => {
      postRepo.findOneBy.mockResolvedValue(makePost({ authorUserId: 'other' }));
      expectDomainError(
        await service.deletePost(me, 'post-1').catch((e) => e),
        FeedErrors.POST_NOT_FOUND,
      );
    });

    it('là tác giả → soft-delete', async () => {
      postRepo.findOneBy.mockResolvedValue(
        makePost({ authorUserId: me.userId }),
      );
      await service.deletePost(me, 'post-1');
      expect(postRepo.update).toHaveBeenCalledWith(
        { id: 'post-1' },
        { deletedAt: expect.any(Date) },
      );
    });
  });

  describe('createComment', () => {
    it('guest bị chặn', async () => {
      expectDomainError(
        await service
          .createComment(guest, 'post-1', { content: 'hi' })
          .catch((e) => e),
        FeedErrors.GUEST_FORBIDDEN,
      );
    });

    it('tăng commentCount atomic cùng transaction insert Comment', async () => {
      await service.createComment(me, 'post-1', { content: 'hi' });
      expect(manager.save).toHaveBeenCalled();
      expect(manager.increment).toHaveBeenCalledWith(
        Post,
        { id: 'post-1' },
        'commentCount',
        1,
      );
    });
  });

  describe('like / unlike — idempotent', () => {
    it('like thành công → tăng likeCount', async () => {
      const result = await service.like(me, 'post-1');
      expect(result).toEqual({ liked: true, likeCount: 1 });
      expect(manager.increment).toHaveBeenCalledWith(
        Post,
        { id: 'post-1' },
        'likeCount',
        1,
      );
    });

    it('like khi đã like (race unique violation) → idempotent, không tăng đếm 2 lần', async () => {
      manager.save.mockRejectedValueOnce(
        Object.assign(new Error('duplicate'), { code: '23505' }),
      );
      const result = await service.like(me, 'post-1');
      expect(result).toEqual({ liked: true, likeCount: 0 });
    });

    it('unlike khi chưa like → no-op, likeCount không đổi', async () => {
      manager.delete.mockResolvedValue({ affected: 0, raw: [] });
      const result = await service.unlike(me, 'post-1');
      expect(result).toEqual({ liked: false, likeCount: 0 });
      expect(manager.decrement).not.toHaveBeenCalled();
    });

    it('unlike khi đang like → xoá + giảm đếm', async () => {
      postRepo.findOneBy.mockResolvedValue(makePost({ likeCount: 1 }));
      const result = await service.unlike(me, 'post-1');
      expect(result).toEqual({ liked: false, likeCount: 0 });
      expect(manager.decrement).toHaveBeenCalledWith(
        Post,
        { id: 'post-1' },
        'likeCount',
        1,
      );
    });
  });
});
