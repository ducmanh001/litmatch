import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DomainException } from '@litmatch/common-exceptions';
import { EntityManager, Repository } from 'typeorm';

import { canonicalPair } from '../../../common/entities/canonical-pair';
import { ProfileChatContact } from '../entities/profile-chat-contact.entity';
import { ProfileFollow } from '../entities/profile-follow.entity';
import { Conversation } from '../entities/conversation.entity';
import { ProfileSocialErrors } from '../friend.errors';
import { SafetyService } from '../../safety';
import { User, UserService } from '../../user';

import type { CoreApiEnv } from '../../../config/env.validation';

export interface ProfileActionsView {
  isFollowing: boolean;
  followerCount: number;
  followingCount: number;
  conversationId: string | null;
  messageAvailable: boolean;
  requiresGift: boolean;
  dailyFirstChatCount: number;
  firstChatThreshold: number;
}

/**
 * Social actions trên public profile: follow và mở chat trực tiếp.
 * Conversation hiện hữu là proof của quyền chat — bao gồm cả Friendship cũ
 * và conversation được mở bằng quà — nên send/list message vẫn đi qua guard
 * membership chung của FriendService. Gate popularity chỉ đếm người lần đầu
 * mở chat trực tiếp với profile trong ngày UTC, không đếm follower.
 */
@Injectable()
export class ProfileSocialService {
  constructor(
    @InjectRepository(ProfileFollow)
    private readonly followRepo: Repository<ProfileFollow>,
    @InjectRepository(ProfileChatContact)
    private readonly chatContactRepo: Repository<ProfileChatContact>,
    @InjectRepository(Conversation)
    private readonly conversationRepo: Repository<Conversation>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly userService: UserService,
    private readonly safetyService: SafetyService,
    private readonly config: ConfigService<CoreApiEnv, true>,
  ) {}

  async follow(
    followerUserId: string,
    followeeUserId: string,
  ): Promise<boolean> {
    await this.assertTarget(followerUserId, followeeUserId);
    await this.assertNotBlocked(followerUserId, followeeUserId);
    await this.followRepo
      .createQueryBuilder()
      .insert()
      .into(ProfileFollow)
      .values({
        followerUserId,
        followeeUserId,
        active: true,
        lastFollowedAt: () => 'now()',
      })
      .orUpdate(
        ['active', 'last_followed_at', 'updated_at'],
        ['follower_user_id', 'followee_user_id'],
      )
      .execute();
    return true;
  }

  async unfollow(
    followerUserId: string,
    followeeUserId: string,
  ): Promise<boolean> {
    await this.assertTarget(followerUserId, followeeUserId);
    await this.assertNotBlocked(followerUserId, followeeUserId);
    await this.followRepo.update(
      { followerUserId, followeeUserId },
      { active: false },
    );
    return false;
  }

  /** Quyền gọi lâu dài: follow phải tồn tại và còn active theo cả hai chiều. */
  async areMutuallyFollowing(
    userAId: string,
    userBId: string,
  ): Promise<boolean> {
    if (userAId === userBId) return false;
    const [aFollowsB, bFollowsA] = await Promise.all([
      this.followRepo.exists({
        where: {
          followerUserId: userAId,
          followeeUserId: userBId,
          active: true,
        },
      }),
      this.followRepo.exists({
        where: {
          followerUserId: userBId,
          followeeUserId: userAId,
          active: true,
        },
      }),
    ]);
    return aFollowsB && bFollowsA;
  }

  /** Quyền gọi thực tế: block 2 chiều được kiểm tra lại ngay trước khi mint token. */
  async canCall(userAId: string, userBId: string): Promise<boolean> {
    if (userAId === userBId) return false;
    const [blockedByA, blockedByB] = await Promise.all([
      this.safetyService.isBlocked(userAId, userBId),
      this.safetyService.isBlocked(userBId, userAId),
    ]);
    if (blockedByA || blockedByB) return false;
    return this.areMutuallyFollowing(userAId, userBId);
  }

  async getActions(
    viewerUserId: string,
    profileUserId: string,
  ): Promise<ProfileActionsView> {
    await this.assertTarget(viewerUserId, profileUserId);
    await this.assertNotBlocked(viewerUserId, profileUserId);

    const [follow, conversation, followerCount, followingCount] =
      await Promise.all([
        this.followRepo.findOneBy({
          followerUserId: viewerUserId,
          followeeUserId: profileUserId,
          active: true,
        }),
        this.findConversation(viewerUserId, profileUserId),
        this.followRepo.countBy({
          followeeUserId: profileUserId,
          active: true,
        }),
        this.followRepo.countBy({
          followerUserId: profileUserId,
          active: true,
        }),
      ]);
    const dailyFirstChatCount = await this.countDailyFirstChats(profileUserId);
    const firstChatThreshold = this.firstChatThreshold();
    const messageAvailable = conversation !== null;

    return {
      isFollowing: follow !== null,
      followerCount,
      followingCount,
      conversationId: conversation?.id ?? null,
      messageAvailable,
      requiresGift:
        !messageAvailable && dailyFirstChatCount >= firstChatThreshold,
      dailyFirstChatCount,
      firstChatThreshold,
    };
  }

  /**
   * Mở conversation free nếu profile chưa chạm ngưỡng. Lock user đích trong
   * transaction để check số first-contact + insert không bị tách đôi khi nhiều
   * người cùng bấm nhắn tin đến đồng thời.
   */
  async openConversation(
    viewerUserId: string,
    profileUserId: string,
  ): Promise<Conversation> {
    await this.assertTarget(viewerUserId, profileUserId);
    await this.assertNotBlocked(viewerUserId, profileUserId);

    return this.userRepo.manager.transaction(async (manager) => {
      await this.lockProfileForChatInManager(manager, profileUserId);
      const existing = await this.findConversationWithManager(
        manager,
        viewerUserId,
        profileUserId,
      );
      if (existing) return existing;

      const dailyFirstChatCount = await this.countDailyFirstChatsWithManager(
        manager,
        profileUserId,
      );
      const firstChatThreshold = this.firstChatThreshold();
      if (dailyFirstChatCount >= firstChatThreshold) {
        throw new DomainException(
          ProfileSocialErrors.MESSAGE_GIFT_REQUIRED,
          'Hồ sơ này đang nhận được nhiều sự quan tâm; hãy tặng một món quà để mở chat',
          HttpStatus.PAYMENT_REQUIRED,
          { dailyFirstChatCount, firstChatThreshold },
        );
      }
      const { conversation, created } = await this.ensureConversationInManager(
        manager,
        viewerUserId,
        profileUserId,
      );
      if (created) {
        await this.ensureProfileChatContactInManager(
          manager,
          profileUserId,
          viewerUserId,
        );
      }
      return conversation;
    });
  }

  /** Lock profile để mọi free/gift first-contact cạnh tranh theo cùng thứ tự. */
  async lockProfileForChatInManager(
    manager: EntityManager,
    profileUserId: string,
  ): Promise<void> {
    const profile = await manager.findOne(User, {
      where: { id: profileUserId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!profile) {
      throw new DomainException(
        ProfileSocialErrors.PROFILE_NOT_AVAILABLE,
        'Không tìm thấy hồ sơ',
        HttpStatus.NOT_FOUND,
      );
    }
  }

  /**
   * Gọi trong transaction Economy Gift để unlock chat và ghi first-contact
   * cùng lúc với GiftEvent/ledger.
   */
  async ensureConversationInManager(
    manager: EntityManager,
    userAId: string,
    userBId: string,
  ): Promise<{ conversation: Conversation; created: boolean }> {
    if (userAId === userBId) {
      throw new DomainException(
        ProfileSocialErrors.SELF_PROFILE_ACTION,
        'Không thể mở chat với chính mình',
        HttpStatus.BAD_REQUEST,
      );
    }
    const [userLowId, userHighId] = canonicalPair(userAId, userBId);
    const existing = await manager.findOne(Conversation, {
      where: { userLowId, userHighId },
    });
    if (existing) return { conversation: existing, created: false };
    await manager
      .createQueryBuilder()
      .insert()
      .into(Conversation)
      .values({ userLowId, userHighId, lastMessageAt: null })
      .orIgnore()
      .execute();
    const conversation = await manager.findOne(Conversation, {
      where: { userLowId, userHighId },
    });
    if (!conversation) {
      throw new Error(
        `Không tìm thấy conversation sau khi mở profile ${userLowId}/${userHighId}`,
      );
    }
    return { conversation, created: true };
  }

  async ensureProfileChatContactInManager(
    manager: EntityManager,
    profileUserId: string,
    requesterUserId: string,
  ): Promise<void> {
    if (profileUserId === requesterUserId) {
      throw new DomainException(
        ProfileSocialErrors.SELF_PROFILE_ACTION,
        'Không thể mở chat với chính mình',
        HttpStatus.BAD_REQUEST,
      );
    }
    await manager
      .createQueryBuilder()
      .insert()
      .into(ProfileChatContact)
      .values({
        profileUserId,
        requesterUserId,
        firstContactDate: () => "(now() AT TIME ZONE 'UTC')::date",
      })
      .orIgnore()
      .execute();
  }

  async assertNotBlocked(userAId: string, userBId: string): Promise<void> {
    if (
      (await this.safetyService.isBlocked(userAId, userBId)) ||
      (await this.safetyService.isBlocked(userBId, userAId))
    ) {
      throw new DomainException(
        ProfileSocialErrors.PROFILE_NOT_AVAILABLE,
        'Không tìm thấy hồ sơ',
        HttpStatus.NOT_FOUND,
      );
    }
  }

  private async assertTarget(
    viewerUserId: string,
    profileUserId: string,
  ): Promise<void> {
    if (viewerUserId === profileUserId) {
      throw new DomainException(
        ProfileSocialErrors.SELF_PROFILE_ACTION,
        'Không thể thao tác với chính mình',
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.userService.getByIdOrThrow(profileUserId);
  }

  private firstChatThreshold(): number {
    return this.config.getOrThrow(
      'PROFILE_DIRECT_MESSAGE_DAILY_FIRST_CHAT_THRESHOLD',
      {
        infer: true,
      },
    );
  }

  private async findConversation(
    userAId: string,
    userBId: string,
  ): Promise<Conversation | null> {
    const [userLowId, userHighId] = canonicalPair(userAId, userBId);
    return this.conversationRepo.findOneBy({ userLowId, userHighId });
  }

  private async findConversationWithManager(
    manager: EntityManager,
    userAId: string,
    userBId: string,
  ): Promise<Conversation | null> {
    const [userLowId, userHighId] = canonicalPair(userAId, userBId);
    return manager.findOne(Conversation, { where: { userLowId, userHighId } });
  }

  private async countDailyFirstChats(profileUserId: string): Promise<number> {
    return this.countDailyFirstChatsWithManager(
      this.chatContactRepo.manager,
      profileUserId,
    );
  }

  private async countDailyFirstChatsWithManager(
    manager: EntityManager,
    profileUserId: string,
  ): Promise<number> {
    const row = await manager
      .getRepository(ProfileChatContact)
      .createQueryBuilder('contact')
      .where('contact.profileUserId = :profileUserId', { profileUserId })
      .andWhere("contact.firstContactDate = (now() AT TIME ZONE 'UTC')::date")
      .getCount();
    return row;
  }
}
