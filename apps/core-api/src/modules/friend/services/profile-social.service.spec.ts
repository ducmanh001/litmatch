import { DomainException } from '@litmatch/common-exceptions';

import { Conversation } from '../entities/conversation.entity';
import { ProfileChatContact } from '../entities/profile-chat-contact.entity';
import { ProfileFollow } from '../entities/profile-follow.entity';
import { ProfileSocialErrors } from '../friend.errors';
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
  const safetyService = { isBlocked: jest.fn(async () => false) };
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
});
