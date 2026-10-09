import { DomainException } from '@litmatch/common-exceptions';

import { Conversation } from '../entities/conversation.entity';
import { ProfileChatContact } from '../entities/profile-chat-contact.entity';
import { ProfileFollow } from '../entities/profile-follow.entity';
import { FriendErrors, ProfileSocialErrors } from '../friend.errors';
import { ProfileSocialService } from './profile-social.service';

import type { ConfigService } from '@nestjs/config';
import type { Repository } from 'typeorm';
import type { CoreApiEnv } from '../../../config/env.validation';
import type { UserService } from '../../user';
import type { SafetyService } from '../../safety';

const VIEWER = '00000000-0000-0000-0000-000000000001';
const PROFILE = '00000000-0000-0000-0000-000000000002';

function queryBuilder(getCount: number) {
  const builder = {
    where: jest.fn(),
    andWhere: jest.fn(),
    getCount: jest.fn(async () => getCount),
    insert: jest.fn(),
    into: jest.fn(),
    values: jest.fn(),
    orUpdate: jest.fn(),
    orIgnore: jest.fn(),
    execute: jest.fn(async () => ({ raw: [] })),
  };
  builder.where.mockReturnValue(builder);
  builder.andWhere.mockReturnValue(builder);
  builder.insert.mockReturnValue(builder);
  builder.into.mockReturnValue(builder);
  builder.values.mockReturnValue(builder);
  builder.orUpdate.mockReturnValue(builder);
  builder.orIgnore.mockReturnValue(builder);
  return builder;
}

function createService(options: {
  dailyFirstChatCount: number;
  conversation?: Conversation | null;
}) {
  const countBuilder = queryBuilder(options.dailyFirstChatCount);
  const followBuilder = queryBuilder(0);
  const contactBuilder = queryBuilder(0);
  const manager = {
    findOne: jest.fn(async (entity: unknown) =>
      entity === Conversation ? (options.conversation ?? null) : {},
    ),
    getRepository: jest.fn(() => ({ createQueryBuilder: () => countBuilder })),
    createQueryBuilder: jest.fn(() => contactBuilder),
  };
  const transaction = jest.fn(async (callback: (manager: never) => unknown) =>
    callback(manager as never),
  );
  const followRepo = {
    findOneBy: jest.fn(async () => null),
    exists: jest.fn(async () => false),
    countBy: jest.fn(async (where: { followerUserId?: string }) =>
      where.followerUserId === PROFILE ? 7 : 12,
    ),
    update: jest.fn(async () => undefined),
    find: jest.fn(async (): Promise<unknown[]> => []),
    query: jest.fn(async (): Promise<unknown[]> => []),
    createQueryBuilder: jest.fn(() => followBuilder),
    manager: { transaction, ...manager },
  };
  const chatContactRepo = { manager: { transaction, ...manager } };
  const conversationRepo = {
    findOneBy: jest.fn(async () => options.conversation ?? null),
  };
  const userRepo = { manager: { transaction } };
  const userService = {
    getByIdOrThrow: jest.fn(async (id: string) => ({ id })),
  };
  const safetyService = {
    isBlocked: jest.fn(async () => false),
    getBlockedUserIds: jest.fn(async (): Promise<string[]> => []),
  };
  const config = {
    getOrThrow: jest.fn(() => 2),
  };
  const service = new ProfileSocialService(
    followRepo as unknown as Repository<ProfileFollow>,
    chatContactRepo as unknown as Repository<ProfileChatContact>,
    conversationRepo as unknown as Repository<Conversation>,
    userRepo as never,
    userService as unknown as UserService,
    safetyService as unknown as SafetyService,
    config as unknown as ConfigService<CoreApiEnv, true>,
  );
  return {
    service,
    followRepo,
    conversationRepo,
    userService,
    manager,
    safetyService,
  };
}

describe('ProfileSocialService', () => {
  it('trả trạng thái yêu cầu quà khi profile đã đủ lượt first-chat trong ngày', async () => {
    const { service, followRepo } = createService({ dailyFirstChatCount: 2 });

    await expect(service.getActions(VIEWER, PROFILE)).resolves.toMatchObject({
      isFollowing: false,
      followerCount: 12,
      followingCount: 7,
      conversationId: null,
      messageAvailable: false,
      requiresGift: true,
      dailyFirstChatCount: 2,
      firstChatThreshold: 2,
    });
    expect(followRepo.countBy).toHaveBeenNthCalledWith(1, {
      followeeUserId: PROFILE,
      active: true,
    });
    expect(followRepo.countBy).toHaveBeenNthCalledWith(2, {
      followerUserId: PROFILE,
      active: true,
    });
  });

  it('conversation đã tồn tại thì vẫn nhắn được dù profile đang vượt ngưỡng', async () => {
    const conversation = Object.assign(new Conversation(), {
      id: 'conversation-1',
    });
    const { service } = createService({
      dailyFirstChatCount: 99,
      conversation,
    });

    await expect(service.getActions(VIEWER, PROFILE)).resolves.toMatchObject({
      conversationId: 'conversation-1',
      messageAvailable: true,
      requiresGift: false,
    });
  });

  it('open conversation chặn atomic ở ngưỡng và không insert', async () => {
    const { service, manager } = createService({ dailyFirstChatCount: 2 });

    await expect(
      service.openConversation(VIEWER, PROFILE),
    ).rejects.toMatchObject({
      code: ProfileSocialErrors.MESSAGE_GIFT_REQUIRED,
    } as Partial<DomainException>);
    expect(manager.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('follow dùng upsert và unfollow chỉ tắt trạng thái, không xoá lịch sử', async () => {
    const { service, followRepo } = createService({ dailyFirstChatCount: 0 });

    await expect(service.follow(VIEWER, PROFILE)).resolves.toBe(true);
    expect(followRepo.createQueryBuilder).toHaveBeenCalled();

    await expect(service.unfollow(VIEWER, PROFILE)).resolves.toBe(false);
    expect(followRepo.update).toHaveBeenCalledWith(
      { followerUserId: VIEWER, followeeUserId: PROFILE },
      { active: false },
    );
  });

  it('chỉ cho gọi khi follow active theo cả hai chiều', async () => {
    const { service, followRepo } = createService({ dailyFirstChatCount: 0 });
    followRepo.exists.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await expect(service.areMutuallyFollowing(VIEWER, PROFILE)).resolves.toBe(
      false,
    );
    expect(followRepo.exists).toHaveBeenNthCalledWith(1, {
      where: {
        followerUserId: VIEWER,
        followeeUserId: PROFILE,
        active: true,
      },
    });

    followRepo.exists.mockResolvedValueOnce(true).mockResolvedValueOnce(true);
    await expect(service.areMutuallyFollowing(VIEWER, PROFILE)).resolves.toBe(
      true,
    );
  });

  it('chặn gọi nếu một chiều đang block dù follow vẫn còn active', async () => {
    const { service, followRepo, safetyService } = createService({
      dailyFirstChatCount: 0,
    });
    followRepo.exists.mockResolvedValue(true);
    safetyService.isBlocked.mockResolvedValueOnce(true);

    await expect(service.canCall(VIEWER, PROFILE)).resolves.toBe(false);
    expect(followRepo.exists).not.toHaveBeenCalled();
  });

  describe('danh sách follower/following', () => {
    const OTHER_A = '00000000-0000-0000-0000-0000000000a1';
    const OTHER_B = '00000000-0000-0000-0000-0000000000b2';
    const OTHER_C = '00000000-0000-0000-0000-0000000000c3';

    function row(id: string, userId: string, at: string) {
      return {
        id,
        userId,
        followedAt: new Date(at.replace(' ', 'T').replace(/\+00$/, 'Z')),
        followedAtText: at,
      };
    }

    /** Builder chainable ghi lại mọi điều kiện, getRawMany trả `rows`. */
    function listBuilder(rows: unknown[]) {
      const builder = {
        innerJoin: jest.fn(),
        select: jest.fn(),
        addSelect: jest.fn(),
        where: jest.fn(),
        andWhere: jest.fn(),
        orderBy: jest.fn(),
        addOrderBy: jest.fn(),
        limit: jest.fn(),
        getRawMany: jest.fn(async () => rows),
      };
      for (const key of [
        'innerJoin',
        'select',
        'addSelect',
        'where',
        'andWhere',
        'orderBy',
        'addOrderBy',
        'limit',
      ] as const) {
        builder[key].mockReturnValue(builder);
      }
      return builder;
    }

    const rows = [
      row(
        '11111111-1111-1111-1111-111111111111',
        OTHER_A,
        '2026-10-10 03:00:03.123456+00',
      ),
      row(
        '22222222-2222-2222-2222-222222222222',
        OTHER_B,
        '2026-10-10 03:00:02.5+00',
      ),
      row(
        '33333333-3333-3333-3333-333333333333',
        OTHER_C,
        '2026-10-10 03:00:01+00',
      ),
    ];

    it('followers: lọc theo followee, cắt về limit và cursor giữ nguyên microsecond', async () => {
      const { service, followRepo } = createService({ dailyFirstChatCount: 0 });
      const builder = listBuilder(rows);
      followRepo.createQueryBuilder.mockReturnValueOnce(builder as never);

      const page = await service.listFollowers(VIEWER, PROFILE, 2);

      expect(builder.where).toHaveBeenCalledWith(
        'follow.followee_user_id = :profileUserId',
        { profileUserId: PROFILE },
      );
      expect(builder.innerJoin).toHaveBeenCalledWith(
        expect.anything(),
        'other',
        'other.id = follow.follower_user_id',
      );
      expect(builder.limit).toHaveBeenCalledWith(3);
      expect(page.items.map((item) => item.userId)).toEqual([OTHER_A, OTHER_B]);
      const next = JSON.parse(
        Buffer.from(page.meta.nextCursor as string, 'base64url').toString(),
      ) as { at: string; id: string };
      expect(next).toEqual({
        at: '2026-10-10 03:00:02.5+00',
        id: '22222222-2222-2222-2222-222222222222',
      });
    });

    it('following: lọc theo follower; hết dữ liệu thì nextCursor = null', async () => {
      const { service, followRepo } = createService({ dailyFirstChatCount: 0 });
      const builder = listBuilder(rows.slice(0, 1));
      followRepo.createQueryBuilder.mockReturnValueOnce(builder as never);

      const page = await service.listFollowing(VIEWER, PROFILE, 20);

      expect(builder.where).toHaveBeenCalledWith(
        'follow.follower_user_id = :profileUserId',
        { profileUserId: PROFILE },
      );
      expect(builder.innerJoin).toHaveBeenCalledWith(
        expect.anything(),
        'other',
        'other.id = follow.followee_user_id',
      );
      expect(page.meta.nextCursor).toBeNull();
    });

    it('loại user đang có block 2 chiều với người xem và truyền cursor vào điều kiện keyset', async () => {
      const { service, followRepo, safetyService } = createService({
        dailyFirstChatCount: 0,
      });
      safetyService.getBlockedUserIds.mockResolvedValueOnce([OTHER_B]);
      const builder = listBuilder([]);
      followRepo.createQueryBuilder.mockReturnValueOnce(builder as never);
      const cursor = Buffer.from(
        JSON.stringify({
          at: '2026-10-10 03:00:02.5+00',
          id: '22222222-2222-2222-2222-222222222222',
        }),
      ).toString('base64url');

      await service.listFollowers(VIEWER, PROFILE, 20, cursor);

      expect(safetyService.getBlockedUserIds).toHaveBeenCalledWith(VIEWER);
      expect(builder.andWhere).toHaveBeenCalledWith(
        'follow.follower_user_id NOT IN (:...blockedIds)',
        { blockedIds: [OTHER_B] },
      );
      expect(builder.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('(follow.last_followed_at, follow.id) <'),
        {
          afterAt: '2026-10-10 03:00:02.5+00',
          afterId: '22222222-2222-2222-2222-222222222222',
        },
      );
    });

    it('cursor sai định dạng bị từ chối 400 trước khi chạm DB', async () => {
      const { service, followRepo } = createService({ dailyFirstChatCount: 0 });
      const badTimestamp = Buffer.from(
        JSON.stringify({ at: "x'); DROP TABLE users;--", id: OTHER_A }),
      ).toString('base64url');

      for (const cursor of ['not-base64-json', badTimestamp]) {
        await expect(
          service.listFollowers(VIEWER, PROFILE, 20, cursor),
        ).rejects.toMatchObject({
          code: FriendErrors.CURSOR_INVALID,
          httpStatus: 400,
        });
      }
      expect(followRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('profile bị block 2 chiều thì 404 như profile không tồn tại', async () => {
      const { service, followRepo, safetyService } = createService({
        dailyFirstChatCount: 0,
      });
      safetyService.isBlocked.mockResolvedValueOnce(true);

      await expect(
        service.listFollowers(VIEWER, PROFILE, 20),
      ).rejects.toMatchObject({
        code: ProfileSocialErrors.PROFILE_NOT_AVAILABLE,
        httpStatus: 404,
      });
      expect(followRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('xem danh sách của chính mình không bị chặn bởi self-check và bỏ qua block-check', async () => {
      const { service, followRepo, safetyService } = createService({
        dailyFirstChatCount: 0,
      });
      followRepo.createQueryBuilder.mockReturnValueOnce(
        listBuilder([]) as never,
      );

      await expect(
        service.listFollowing(VIEWER, VIEWER, 20),
      ).resolves.toMatchObject({ items: [], meta: { nextCursor: null } });
      expect(safetyService.isBlocked).not.toHaveBeenCalled();
    });

    it('listConnections: truyền user, trạng thái active, danh sách block và limit vào một query gộp', async () => {
      const { service, followRepo, safetyService } = createService({
        dailyFirstChatCount: 0,
      });
      const since = new Date('2026-10-10T03:00:00.000Z');
      safetyService.getBlockedUserIds.mockResolvedValueOnce([OTHER_B]);
      followRepo.query.mockResolvedValueOnce([
        { partnerId: OTHER_A, isFriend: true, isMutualFollow: true, since },
      ]);

      await expect(service.listConnections(VIEWER, 50)).resolves.toEqual([
        { partnerId: OTHER_A, isFriend: true, isMutualFollow: true, since },
      ]);
      expect(followRepo.query).toHaveBeenCalledWith(
        expect.stringContaining('UNION ALL'),
        [VIEWER, 'active', [OTHER_B], 50],
      );
    });

    it('filterFollowedIds: không query khi danh sách rỗng, trả Set id đang theo dõi', async () => {
      const { service, followRepo } = createService({ dailyFirstChatCount: 0 });

      await expect(service.filterFollowedIds(VIEWER, [])).resolves.toEqual(
        new Set(),
      );
      expect(followRepo.find).not.toHaveBeenCalled();

      followRepo.find.mockResolvedValueOnce([{ followeeUserId: OTHER_A }]);
      await expect(
        service.filterFollowedIds(VIEWER, [OTHER_A, OTHER_B]),
      ).resolves.toEqual(new Set([OTHER_A]));
    });

    it('getFollowCounts dùng được cho chính mình và trả đúng 2 số', async () => {
      const { service } = createService({ dailyFirstChatCount: 0 });

      await expect(service.getFollowCounts(VIEWER, VIEWER)).resolves.toEqual({
        followerCount: 12,
        followingCount: 12,
      });
      await expect(service.getFollowCounts(VIEWER, PROFILE)).resolves.toEqual({
        followerCount: 12,
        followingCount: 7,
      });
    });
  });
});
