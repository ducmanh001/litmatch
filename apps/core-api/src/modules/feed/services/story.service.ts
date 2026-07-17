import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DomainException } from '@litmatch/common-exceptions';
import { Repository } from 'typeorm';

import { storyIdempotencyKey } from '../feed.constants';
import { FeedErrors } from '../feed.errors';
import { Story, StoryAudience } from '../entities/story.entity';
import { StoryView } from '../entities/story-view.entity';
import { isUniqueViolation } from '../../../database/postgres-errors';
import { FriendService } from '../../friend';
import { SafetyService } from '../../safety';

import type { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import type { Message } from '../../friend';
import type { CoreApiEnv } from '../../../config/env.validation';

export interface CreateStoryInput {
  mediaUrl: string;
  caption?: string;
  audience?: StoryAudience;
}

/**
 * Sub-service Stories (docs/services/feed-service.md § 8) — chỉ `FeedController`/`StoryController`
 * gọi qua facade (docs/05 § 5.3 chỉ áp cho service-nội-bộ; ở đây tách controller riêng vì Stories
 * là 1 mảng nghiệp vụ khác hẳn Post, xem docs/16 § 16.3 — service vẫn coi là internal, không export
 * ngoài module).
 */
@Injectable()
export class StoryService {
  constructor(
    @InjectRepository(Story) private readonly storyRepo: Repository<Story>,
    @InjectRepository(StoryView)
    private readonly viewRepo: Repository<StoryView>,
    private readonly friendService: FriendService,
    private readonly safetyService: SafetyService,
    private readonly config: ConfigService<CoreApiEnv, true>,
  ) {}

  async createStory(
    user: AuthenticatedUser,
    dto: CreateStoryInput,
    idempotencyKey: string,
  ): Promise<Story> {
    this.assertNotGuest(user);
    if (!dto.mediaUrl) {
      throw new DomainException(
        FeedErrors.STORY_MEDIA_URL_REQUIRED,
        'Story phải có mediaUrl',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    const ttlHours = this.config.getOrThrow('STORY_TTL_HOURS', {
      infer: true,
    });
    const key = storyIdempotencyKey(user.userId, idempotencyKey);
    try {
      return await this.storyRepo.save(
        this.storyRepo.create({
          authorUserId: user.userId,
          mediaUrl: dto.mediaUrl,
          caption: dto.caption ?? null,
          audience: dto.audience ?? StoryAudience.Friends,
          expiresAt: new Date(Date.now() + ttlHours * 3600 * 1000),
          idempotencyKey: key,
        }),
      );
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      const existing = await this.storyRepo.findOneBy({ idempotencyKey: key });
      if (existing && existing.mediaUrl === dto.mediaUrl) return existing;
      throw new DomainException(
        FeedErrors.POST_IDEMPOTENCY_CONFLICT,
        'Idempotency-Key đã dùng cho 1 story khác',
        HttpStatus.CONFLICT,
      );
    }
  }

  /**
   * Ring: story còn hạn của chính mình + bạn bè (quyết định chốt § 6 — chưa phân phối rộng hơn
   * dù `audience=public` tồn tại trên schema), loại tác giả đang block 2 chiều.
   */
  async getRing(user: AuthenticatedUser): Promise<Story[]> {
    const [friendIds, blockedIds] = await Promise.all([
      this.friendService.listFriendIds(user.userId),
      this.safetyService.getBlockedUserIds(user.userId),
    ]);
    const authorIds = [user.userId, ...friendIds].filter(
      (id) => !blockedIds.includes(id),
    );
    if (authorIds.length === 0) return [];

    return this.storyRepo
      .createQueryBuilder('s')
      .where('s.authorUserId IN (:...authorIds)', { authorIds })
      .andWhere('s.expiresAt > :now', { now: new Date() })
      .orderBy('s.authorUserId', 'ASC')
      .addOrderBy('s.createdAt', 'DESC')
      .getMany();
  }

  /**
   * Tồn tại + chưa hết hạn + không block + đúng audience — CÙNG mã lỗi cho mọi vi phạm
   * (docs/services/feed-service.md § 8, cùng nguyên tắc oracle-safe của Post).
   */
  async getStoryOrThrow(
    user: AuthenticatedUser,
    storyId: string,
  ): Promise<Story> {
    const story = await this.storyRepo.findOneBy({ id: storyId });
    if (!story || story.expiresAt <= new Date()) {
      throw new DomainException(
        FeedErrors.STORY_NOT_FOUND,
        'Không tìm thấy story',
        HttpStatus.NOT_FOUND,
      );
    }
    if (story.authorUserId !== user.userId) {
      const blocked =
        (await this.safetyService.isBlocked(user.userId, story.authorUserId)) ||
        (await this.safetyService.isBlocked(story.authorUserId, user.userId));
      const audienceAllowed =
        story.audience === StoryAudience.Public ||
        (await this.friendService.areFriends(user.userId, story.authorUserId));
      if (blocked || !audienceAllowed) {
        throw new DomainException(
          FeedErrors.STORY_NOT_FOUND,
          'Không tìm thấy story',
          HttpStatus.NOT_FOUND,
        );
      }
    }
    return story;
  }

  /** Ghi seen-state — self-view không đếm (docs/services/feed-service.md § 8). Idempotent. */
  async viewStory(user: AuthenticatedUser, storyId: string): Promise<Story> {
    const story = await this.getStoryOrThrow(user, storyId);
    if (story.authorUserId === user.userId) return story;
    try {
      await this.viewRepo.save(
        this.viewRepo.create({ storyId, viewerId: user.userId }),
      );
    } catch (err) {
      if (!isUniqueViolation(err)) throw err; // đã xem trước đó — no-op
    }
    return story;
  }

  /**
   * Chỉ tác giả xem được — lọc block HIỆN TẠI lúc đọc (docs/services/feed-service.md § 8): viewer
   * đã xem trước khi block vẫn bị ẩn khỏi danh sách nếu block xảy ra sau đó.
   */
  async listViewers(
    user: AuthenticatedUser,
    storyId: string,
  ): Promise<string[]> {
    const story = await this.storyRepo.findOneBy({ id: storyId });
    if (!story || story.authorUserId !== user.userId) {
      throw new DomainException(
        FeedErrors.STORY_NOT_FOUND,
        'Không tìm thấy story',
        HttpStatus.NOT_FOUND,
      );
    }
    const blockedIds = await this.safetyService.getBlockedUserIds(user.userId);
    const views = await this.viewRepo.findBy({ storyId });
    return views
      .map((v) => v.viewerId)
      .filter((viewerId) => !blockedIds.includes(viewerId));
  }

  /**
   * Reply → DM qua FriendService.sendMessage với attachment snapshot mediaUrl (story chết sau
   * TTL, message sống mãi — docs/plans/2026-07-14-plan-6-tinh-nang-social-discovery.md § 3.3).
   * Đi trọn pipeline idempotency/block/realtime/notification sẵn có của Friend Chat.
   */
  async replyToStory(
    user: AuthenticatedUser,
    storyId: string,
    content: string,
    idempotencyKey: string,
  ): Promise<Message> {
    const story = await this.getStoryOrThrow(user, storyId);
    // getStoryOrThrow đã cho phép xem (self/bạn bè/public không block) — nhưng reply→DM cần CÓ
    // Conversation thật, chỉ tồn tại giữa 2 người đã là bạn. Trường hợp duy nhất lệch nhau: story
    // audience=public từ người lạ (không phải bạn) — dịch sang lỗi Feed riêng, không phụ thuộc
    // mã lỗi nội bộ của Friend module (docs/16 § 16.4, tránh coupling qua taxonomy module khác).
    const conversation = await this.friendService
      .getConversationWithFriend(user.userId, story.authorUserId)
      .catch(() => {
        throw new DomainException(
          FeedErrors.STORY_REPLY_REQUIRES_FRIENDSHIP,
          'Chỉ trả lời được story của bạn bè',
          HttpStatus.FORBIDDEN,
        );
      });
    return this.friendService.sendMessage(
      user.userId,
      conversation.id,
      content,
      idempotencyKey,
      { kind: 'story_reply', payload: { storyId, mediaUrl: story.mediaUrl } },
    );
  }

  private assertNotGuest(user: AuthenticatedUser): void {
    if (user.isGuest) {
      throw new DomainException(
        FeedErrors.GUEST_FORBIDDEN,
        'Guest chưa gắn phone/social không thể đăng story',
        HttpStatus.FORBIDDEN,
      );
    }
  }
}
