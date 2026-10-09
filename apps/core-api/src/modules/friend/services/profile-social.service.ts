import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { buildCursorPage, decodeCursor } from '@litmatch/common-dtos';
import { DomainException } from '@litmatch/common-exceptions';
import { EntityManager, In, Repository } from 'typeorm';

import { canonicalPair } from '../../../common/entities/canonical-pair';
import { ProfileChatContact } from '../entities/profile-chat-contact.entity';
import { ProfileFollow } from '../entities/profile-follow.entity';
import { Conversation } from '../entities/conversation.entity';
import { FriendErrors, ProfileSocialErrors } from '../friend.errors';
import { SafetyService } from '../../safety';
import { User, UserService, UserStatus } from '../../user';

import type { CursorPage } from '@litmatch/common-dtos';
import type { CoreApiEnv } from '../../../config/env.validation';

export type FollowListKind = 'followers' | 'following';

export interface FollowCountsView {
  followerCount: number;
  followingCount: number;
}

/** Một dòng trong danh sách follower/following: `userId` là phía còn lại của quan hệ. */
export interface FollowListEntry {
  userId: string;
  followedAt: Date;
}

/**
 * Một người trong danh sách bạn bè: kết nối qua ghép đôi (`isFriend` = Friendship) và/hoặc hai bên
 * đang follow nhau (`isMutualFollow`). Không cần có conversation.
 */
export interface ConnectionEntry {
  partnerId: string;
  isFriend: boolean;
  isMutualFollow: boolean;
  since: Date;
}

/** Số bạn bè tối đa trả về một lần — cùng cỡ với `FRIEND_GRAPH_READ_LIMIT` của FriendService. */
const CONNECTIONS_LIMIT = 500;

/** Timestamp text của Postgres (vd `2026-10-10 03:12:11.123456+00`) — giữ nguyên microsecond. */
const PG_TIMESTAMPTZ_TEXT =
  /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d{1,6})?[+-]\d{2}(:\d{2})?$/;
const UUID_TEXT =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

    const [follow, conversation, { followerCount, followingCount }] =
      await Promise.all([
        this.followRepo.findOneBy({
          followerUserId: viewerUserId,
          followeeUserId: profileUserId,
          active: true,
        }),
        this.findConversation(viewerUserId, profileUserId),
        this.countFollows(profileUserId),
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
   * Số follower/following của một profile — dùng được cho cả chính mình (khác `getActions`
   * từ chối self) để màn Cá nhân hiển thị số và mở danh sách của mình.
   */
  async getFollowCounts(
    viewerUserId: string,
    profileUserId: string,
  ): Promise<FollowCountsView> {
    await this.assertProfileReadable(viewerUserId, profileUserId);
    return this.countFollows(profileUserId);
  }

  /**
   * Bạn bè của `userId` = Friendship (cùng "Thích" lúc ghép đôi) ∪ follow active theo cả hai
   * chiều. Gộp một dòng mỗi người (hai cờ có thể cùng true), mới kết nối nhất trước; loại user bị
   * khoá và người có block 2 chiều với `userId`.
   */
  async listConnections(
    userId: string,
    limit: number = CONNECTIONS_LIMIT,
  ): Promise<ConnectionEntry[]> {
    const blockedIds = await this.safetyService.getBlockedUserIds(userId);
    const rows: Array<{
      partnerId: string;
      isFriend: boolean;
      isMutualFollow: boolean;
      since: Date;
    }> = await this.followRepo.query(
      `
      SELECT c.partner_id AS "partnerId",
             bool_or(c.is_friend) AS "isFriend",
             bool_or(c.is_mutual) AS "isMutualFollow",
             max(c.since) AS "since"
      FROM (
        SELECT CASE WHEN f.user_low_id = $1 THEN f.user_high_id ELSE f.user_low_id END AS partner_id,
               true AS is_friend, false AS is_mutual, f.created_at AS since
        FROM friendships f
        WHERE f.user_low_id = $1 OR f.user_high_id = $1
        UNION ALL
        SELECT a.followee_user_id, false, true,
               GREATEST(a.last_followed_at, b.last_followed_at)
        FROM profile_follows a
        JOIN profile_follows b
          ON b.follower_user_id = a.followee_user_id
         AND b.followee_user_id = a.follower_user_id
        WHERE a.follower_user_id = $1 AND a.active AND b.active
      ) c
      JOIN users u ON u.id = c.partner_id AND u.status = $2
      WHERE c.partner_id <> ALL($3::uuid[])
      GROUP BY c.partner_id
      ORDER BY max(c.since) DESC, c.partner_id DESC
      LIMIT $4
      `,
      [userId, UserStatus.Active, blockedIds, limit],
    );
    return rows.map((row) => ({
      partnerId: row.partnerId,
      isFriend: row.isFriend,
      isMutualFollow: row.isMutualFollow,
      since: row.since,
    }));
  }

  /** Trong `userIds`, những ai `viewerUserId` đang theo dõi (active) — gắn cờ cho từng dòng danh sách. */
  async filterFollowedIds(
    viewerUserId: string,
    userIds: readonly string[],
  ): Promise<Set<string>> {
    if (userIds.length === 0) return new Set();
    const rows = await this.followRepo.find({
      select: { followeeUserId: true },
      where: {
        followerUserId: viewerUserId,
        followeeUserId: In([...userIds]),
        active: true,
      },
    });
    return new Set(rows.map((row) => row.followeeUserId));
  }

  /** Người đang theo dõi `profileUserId`, mới theo dõi nhất trước. */
  async listFollowers(
    viewerUserId: string,
    profileUserId: string,
    limit: number,
    cursor?: string,
  ): Promise<CursorPage<FollowListEntry>> {
    return this.listFollowEdges(
      'followers',
      viewerUserId,
      profileUserId,
      limit,
      cursor,
    );
  }

  /** Profile mà `profileUserId` đang theo dõi, mới theo dõi nhất trước. */
  async listFollowing(
    viewerUserId: string,
    profileUserId: string,
    limit: number,
    cursor?: string,
  ): Promise<CursorPage<FollowListEntry>> {
    return this.listFollowEdges(
      'following',
      viewerUserId,
      profileUserId,
      limit,
      cursor,
    );
  }

  /**
   * Keyset theo (last_followed_at, id) giảm dần. Cursor mang timestamp dạng text của Postgres
   * (không qua `Date`) để không mất microsecond — cắt về mili-giây làm dòng cuối trang
   * lặp lại ở trang sau. Chỉ trả user còn active và không có block 2 chiều với người xem.
   */
  private async listFollowEdges(
    kind: FollowListKind,
    viewerUserId: string,
    profileUserId: string,
    limit: number,
    cursor?: string,
  ): Promise<CursorPage<FollowListEntry>> {
    await this.assertProfileReadable(viewerUserId, profileUserId);
    const after = this.decodeFollowCursor(cursor);
    const [ownerColumn, otherColumn] =
      kind === 'followers'
        ? (['followee_user_id', 'follower_user_id'] as const)
        : (['follower_user_id', 'followee_user_id'] as const);
    const blockedIds = await this.safetyService.getBlockedUserIds(viewerUserId);

    const query = this.followRepo
      .createQueryBuilder('follow')
      .innerJoin(User, 'other', `other.id = follow.${otherColumn}`)
      .select('follow.id', 'id')
      .addSelect(`follow.${otherColumn}`, 'userId')
      .addSelect('follow.last_followed_at', 'followedAt')
      .addSelect('follow.last_followed_at::text', 'followedAtText')
      .where(`follow.${ownerColumn} = :profileUserId`, { profileUserId })
      .andWhere('follow.active = true')
      .andWhere('other.status = :activeStatus', {
        activeStatus: UserStatus.Active,
      });
    if (blockedIds.length > 0) {
      query.andWhere(`follow.${otherColumn} NOT IN (:...blockedIds)`, {
        blockedIds,
      });
    }
    if (after) {
      query.andWhere(
        '(follow.last_followed_at, follow.id) < (CAST(:afterAt AS timestamptz), CAST(:afterId AS uuid))',
        { afterAt: after.at, afterId: after.id },
      );
    }
    const rows = await query
      .orderBy('follow.last_followed_at', 'DESC')
      .addOrderBy('follow.id', 'DESC')
      .limit(limit + 1)
      .getRawMany<{
        id: string;
        userId: string;
        followedAt: Date;
        followedAtText: string;
      }>();

    const page = buildCursorPage(rows, limit, (last) => ({
      at: last.followedAtText,
      id: last.id,
    }));
    return {
      items: page.items.map((row) => ({
        userId: row.userId,
        followedAt: row.followedAt,
      })),
      meta: page.meta,
    };
  }

  private decodeFollowCursor(
    cursor: string | undefined,
  ): { at: string; id: string } | undefined {
    if (!cursor) return undefined;
    const pos = decodeCursor<{ at?: unknown; id?: unknown }>(cursor);
    if (
      !pos ||
      typeof pos.at !== 'string' ||
      !PG_TIMESTAMPTZ_TEXT.test(pos.at) ||
      typeof pos.id !== 'string' ||
      !UUID_TEXT.test(pos.id)
    ) {
      throw new DomainException(
        FriendErrors.CURSOR_INVALID,
        'Cursor không hợp lệ',
        HttpStatus.BAD_REQUEST,
      );
    }
    return { at: pos.at, id: pos.id };
  }

  /** Profile phải tồn tại và không bị block 2 chiều với người xem (xem chính mình luôn được). */
  private async assertProfileReadable(
    viewerUserId: string,
    profileUserId: string,
  ): Promise<void> {
    await this.userService.getByIdOrThrow(profileUserId);
    if (viewerUserId !== profileUserId) {
      await this.assertNotBlocked(viewerUserId, profileUserId);
    }
  }

  private async countFollows(profileUserId: string): Promise<FollowCountsView> {
    const [followerCount, followingCount] = await Promise.all([
      this.followRepo.countBy({ followeeUserId: profileUserId, active: true }),
      this.followRepo.countBy({ followerUserId: profileUserId, active: true }),
    ]);
    return { followerCount, followingCount };
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
