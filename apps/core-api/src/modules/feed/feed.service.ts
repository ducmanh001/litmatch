import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import {
  buildCursorPage,
  decodeCursor,
  isValidSeqCursor,
} from '@litmatch/common-dtos';
import { DomainException } from '@litmatch/common-exceptions';
import { DataSource, Repository } from 'typeorm';

import { isUniqueViolation } from '../../database/postgres-errors';
import { feedPostIdempotencyKey } from './feed.constants';
import { FeedErrors } from './feed.errors';
import { Comment } from './entities/comment.entity';
import { Post, PostAudience } from './entities/post.entity';
import { Reaction } from './entities/reaction.entity';
import { FriendService } from '../friend';
import { NotificationService, NotificationType } from '../notification';
import { SafetyService } from '../safety';

import type { CursorPage, CursorPageQueryDto } from '@litmatch/common-dtos';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import type { CreateCommentDto, CreatePostDto } from './dto/feed.dtos';
import type { Notification } from '../notification';

/**
 * Facade Feed (docs/services/feed-service.md): post/like/comment công khai toàn cục, không
 * fanout. Block cắt hết điểm chạm qua `SafetyService`; counter atomic cùng transaction.
 */
@Injectable()
export class FeedService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Post) private readonly postRepo: Repository<Post>,
    @InjectRepository(Comment)
    private readonly commentRepo: Repository<Comment>,
    @InjectRepository(Reaction)
    private readonly reactionRepo: Repository<Reaction>,
    private readonly safetyService: SafetyService,
    private readonly friendService: FriendService,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * Idempotent theo `idempotencyKey` (unique DB, prefix theo user — retry mất mạng không tạo
   * đôi bài, docs/05 § 5.10). `audience` mặc định `public` — không đổi hành vi cũ khi client chưa
   * gửi field này.
   */
  async createPost(
    user: AuthenticatedUser,
    dto: CreatePostDto,
    idempotencyKey: string,
  ): Promise<Post> {
    this.assertNotGuest(user);
    if (!dto.content && !dto.imageUrl) {
      throw new DomainException(
        FeedErrors.POST_CONTENT_REQUIRED,
        'Bài viết phải có content hoặc imageUrl',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    const key = feedPostIdempotencyKey(user.userId, idempotencyKey);
    try {
      return await this.postRepo.save(
        this.postRepo.create({
          authorUserId: user.userId,
          content: dto.content ?? null,
          imageUrl: dto.imageUrl ?? null,
          audience: dto.audience ?? PostAudience.Public,
          idempotencyKey: key,
        }),
      );
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      const existing = await this.postRepo.findOneBy({ idempotencyKey: key });
      if (
        existing &&
        existing.content === (dto.content ?? null) &&
        existing.imageUrl === (dto.imageUrl ?? null)
      ) {
        return existing; // replay — client retry sau timeout mạng
      }
      throw new DomainException(
        FeedErrors.POST_IDEMPOTENCY_CONFLICT,
        'Idempotency-Key đã dùng cho 1 bài viết khác nội dung',
        HttpStatus.CONFLICT,
      );
    }
  }

  /**
   * Feed công khai toàn cục — CHỈ `audience=public` (docs/services/feed-service.md § 7): trộn
   * `friends`/`only_me` vào đây sẽ bắt buộc check quan hệ bạn cho từng tác giả trên 1 trang lớn,
   * quá tốn cho 1 feed discovery; xem bài `friends`/`only_me` qua `listUserTimeline` (1 tác giả).
   * Loại tác giả đang block/bị block (docs/services/feed-service.md § 3).
   */
  async listFeed(
    user: AuthenticatedUser,
    query: CursorPageQueryDto,
  ): Promise<CursorPage<Post>> {
    const blockedIds = await this.safetyService.getBlockedUserIds(user.userId);

    const qb = this.postRepo
      .createQueryBuilder('p')
      .where('p.deletedAt IS NULL')
      .andWhere('p.audience = :audience', { audience: PostAudience.Public });

    if (query.cursor) {
      const payload = decodeCursor<{ seq?: unknown }>(query.cursor);
      if (!isValidSeqCursor(payload)) {
        throw new DomainException(
          FeedErrors.CURSOR_INVALID,
          'Cursor không hợp lệ',
          HttpStatus.BAD_REQUEST,
        );
      }
      qb.andWhere('p.seq < :afterSeq', { afterSeq: payload.seq });
    }
    if (blockedIds.length > 0) {
      qb.andWhere('p.authorUserId NOT IN (:...blockedIds)', { blockedIds });
    }

    const rows = await qb
      .orderBy('p.seq', 'DESC')
      .take(query.limit + 1)
      .getMany();
    return buildCursorPage(rows, query.limit, (last) => ({ seq: last.seq }));
  }

  /**
   * Profile timeline — bài của 1 tác giả theo góc nhìn `viewer` (docs/services/feed-service.md
   * § 7): tự xem mình → mọi audience; là bạn → `public`+`friends`; người lạ → chỉ `public`.
   * Block 2 chiều → trả rỗng (KHÔNG throw) — nhìn giống hệt "tác giả chưa đăng bài nào", cùng
   * tinh thần oracle-safe (không lộ trạng thái block qua hành vi khác với 0 bài viết).
   */
  async listUserTimeline(
    viewer: AuthenticatedUser,
    authorUserId: string,
    query: CursorPageQueryDto,
  ): Promise<CursorPage<Post>> {
    const isSelf = viewer.userId === authorUserId;
    if (!isSelf) {
      const blocked =
        (await this.safetyService.isBlocked(viewer.userId, authorUserId)) ||
        (await this.safetyService.isBlocked(authorUserId, viewer.userId));
      if (blocked) return { items: [], meta: { nextCursor: null } };
    }
    const audiences = isSelf
      ? [PostAudience.Public, PostAudience.Friends, PostAudience.OnlyMe]
      : (await this.friendService.areFriends(viewer.userId, authorUserId))
        ? [PostAudience.Public, PostAudience.Friends]
        : [PostAudience.Public];

    const qb = this.postRepo
      .createQueryBuilder('p')
      .where('p.authorUserId = :authorUserId', { authorUserId })
      .andWhere('p.deletedAt IS NULL')
      .andWhere('p.audience IN (:...audiences)', { audiences });

    if (query.cursor) {
      const payload = decodeCursor<{ seq?: unknown }>(query.cursor);
      if (!isValidSeqCursor(payload)) {
        throw new DomainException(
          FeedErrors.CURSOR_INVALID,
          'Cursor không hợp lệ',
          HttpStatus.BAD_REQUEST,
        );
      }
      qb.andWhere('p.seq < :afterSeq', { afterSeq: payload.seq });
    }

    const rows = await qb
      .orderBy('p.seq', 'DESC')
      .take(query.limit + 1)
      .getMany();
    return buildCursorPage(rows, query.limit, (last) => ({ seq: last.seq }));
  }

  /**
   * Tồn tại + chưa xoá + không block + đúng audience cho phép `user` xem — CÙNG mã lỗi cho MỌI
   * trường hợp vi phạm (không tồn tại/đã xoá/bị block/audience không cho phép) để không lộ lý do
   * thật (docs/services/feed-service.md § 3, § 7). Guard trung tâm — dùng lại ở comment/like/xoá
   * nên audience tự động chặn luôn tương tác với bài `friends`/`only_me` mà `user` không được xem,
   * không phải chặn riêng lẻ ở từng action.
   */
  async getPostOrThrow(user: AuthenticatedUser, postId: string): Promise<Post> {
    const post = await this.postRepo.findOneBy({ id: postId });
    if (!post || post.deletedAt) {
      throw new DomainException(
        FeedErrors.POST_NOT_FOUND,
        'Không tìm thấy bài viết',
        HttpStatus.NOT_FOUND,
      );
    }
    if (post.authorUserId !== user.userId) {
      const blocked =
        (await this.safetyService.isBlocked(user.userId, post.authorUserId)) ||
        (await this.safetyService.isBlocked(post.authorUserId, user.userId));
      const audienceAllowed =
        post.audience === PostAudience.Public ||
        (post.audience === PostAudience.Friends &&
          (await this.friendService.areFriends(
            user.userId,
            post.authorUserId,
          )));
      if (blocked || !audienceAllowed) {
        throw new DomainException(
          FeedErrors.POST_NOT_FOUND,
          'Không tìm thấy bài viết',
          HttpStatus.NOT_FOUND,
        );
      }
    }
    return post;
  }

  /** Xoá mềm — chỉ tác giả (postId public nên 403 không lộ gì thêm, khác Friend Chat). */
  async deletePost(user: AuthenticatedUser, postId: string): Promise<void> {
    const post = await this.getPostOrThrow(user, postId);
    if (post.authorUserId !== user.userId) {
      throw new DomainException(
        FeedErrors.POST_NOT_FOUND,
        'Bài viết không thuộc về bạn',
        HttpStatus.FORBIDDEN,
      );
    }
    await this.postRepo.update({ id: postId }, { deletedAt: new Date() });
  }

  async createComment(
    user: AuthenticatedUser,
    postId: string,
    dto: CreateCommentDto,
  ): Promise<Comment> {
    this.assertNotGuest(user);
    const post = await this.getPostOrThrow(user, postId); // guard block/tồn tại (§ 3)

    let notification: Notification | undefined;
    const comment = await this.dataSource.transaction(async (manager) => {
      const created = await manager.save(
        manager.create(Comment, {
          postId,
          authorUserId: user.userId,
          content: dto.content,
        }),
      );
      await manager.increment(Post, { id: postId }, 'commentCount', 1);
      // Bỏ qua tự comment lên bài mình (docs/services/notification-service.md § 3)
      if (post.authorUserId !== user.userId) {
        notification = await this.notificationService.createWithManager(
          manager,
          {
            userId: post.authorUserId,
            type: NotificationType.PostCommented,
            payload: {
              postId,
              commentId: created.id,
              actorUserId: user.userId,
            },
          },
        );
      }
      return created;
    });
    if (notification) await this.notificationService.sendPush(notification);
    return comment;
  }

  async listComments(
    user: AuthenticatedUser,
    postId: string,
    query: CursorPageQueryDto,
  ): Promise<CursorPage<Comment>> {
    await this.getPostOrThrow(user, postId);

    let afterSeq = '0';
    if (query.cursor) {
      const payload = decodeCursor<{ seq?: unknown }>(query.cursor);
      if (!isValidSeqCursor(payload)) {
        throw new DomainException(
          FeedErrors.CURSOR_INVALID,
          'Cursor không hợp lệ',
          HttpStatus.BAD_REQUEST,
        );
      }
      afterSeq = payload.seq;
    }

    const rows = await this.commentRepo
      .createQueryBuilder('c')
      .where('c.postId = :postId', { postId })
      .andWhere('c.deletedAt IS NULL')
      .andWhere('c.seq > :afterSeq', { afterSeq })
      .orderBy('c.seq', 'ASC')
      .take(query.limit + 1)
      .getMany();
    return buildCursorPage(rows, query.limit, (last) => ({ seq: last.seq }));
  }

  async deleteComment(
    user: AuthenticatedUser,
    commentId: string,
  ): Promise<void> {
    const comment = await this.commentRepo.findOneBy({ id: commentId });
    if (!comment || comment.deletedAt) {
      throw new DomainException(
        FeedErrors.COMMENT_NOT_FOUND,
        'Không tìm thấy comment',
        HttpStatus.NOT_FOUND,
      );
    }
    if (comment.authorUserId !== user.userId) {
      throw new DomainException(
        FeedErrors.COMMENT_NOT_FOUND,
        'Comment không thuộc về bạn',
        HttpStatus.FORBIDDEN,
      );
    }
    await this.dataSource.transaction(async (manager) => {
      await manager.update(
        Comment,
        { id: commentId },
        { deletedAt: new Date() },
      );
      await manager.decrement(Post, { id: comment.postId }, 'commentCount', 1);
    });
  }

  /** Idempotent — like khi đã like là no-op, không tăng đếm 2 lần (unique DB chặn race). */
  async like(
    user: AuthenticatedUser,
    postId: string,
  ): Promise<{ liked: boolean; likeCount: number }> {
    this.assertNotGuest(user);
    const post = await this.getPostOrThrow(user, postId);

    let notification: Notification | undefined;
    try {
      await this.dataSource.transaction(async (manager) => {
        await manager.save(
          manager.create(Reaction, { postId, userId: user.userId }),
        );
        await manager.increment(Post, { id: postId }, 'likeCount', 1);
        // Bỏ qua tự like bài mình (docs/services/notification-service.md § 3)
        if (post.authorUserId !== user.userId) {
          notification = await this.notificationService.createWithManager(
            manager,
            {
              userId: post.authorUserId,
              type: NotificationType.PostLiked,
              payload: { postId, actorUserId: user.userId },
            },
          );
        }
      });
      if (notification) await this.notificationService.sendPush(notification);
      return { liked: true, likeCount: post.likeCount + 1 };
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      return { liked: true, likeCount: post.likeCount }; // replay — đã like từ trước
    }
  }

  /** Idempotent — unlike khi chưa like là no-op. */
  async unlike(
    user: AuthenticatedUser,
    postId: string,
  ): Promise<{ liked: boolean; likeCount: number }> {
    const post = await this.getPostOrThrow(user, postId);
    const result = await this.dataSource.transaction(async (manager) => {
      const { affected } = await manager.delete(Reaction, {
        postId,
        userId: user.userId,
      });
      if (affected) {
        await manager.decrement(Post, { id: postId }, 'likeCount', 1);
      }
      return affected;
    });
    return {
      liked: false,
      likeCount: result ? post.likeCount - 1 : post.likeCount,
    };
  }

  async reactionStatus(
    user: AuthenticatedUser,
    postId: string,
  ): Promise<{ liked: boolean; likeCount: number }> {
    const post = await this.getPostOrThrow(user, postId);
    const liked = await this.reactionRepo.exists({
      where: { postId, userId: user.userId },
    });
    return { liked, likeCount: post.likeCount };
  }

  private assertNotGuest(user: AuthenticatedUser): void {
    if (user.isGuest) {
      throw new DomainException(
        FeedErrors.GUEST_FORBIDDEN,
        'Guest chưa gắn phone/social không thể tạo nội dung trên Feed',
        HttpStatus.FORBIDDEN,
      );
    }
  }
}
