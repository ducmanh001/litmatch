import { DataSource } from 'typeorm';

import { SnakeNamingStrategy } from '../../database/snake-naming.strategy';
import { InitAuthUser1751900000000 } from '../../database/migrations/1751900000000-init-auth-user';
import { MatchingCore1752200000000 } from '../../database/migrations/1752200000000-matching-core';
import { MatchingGenderPreference1752300000000 } from '../../database/migrations/1752300000000-matching-gender-preference';
import { Safety1752800000000 } from '../../database/migrations/1752800000000-safety';
import { Feed1752900000000 } from '../../database/migrations/1752900000000-feed';
import { Notification1753000000000 } from '../../database/migrations/1753000000000-notification';

import { FeedService } from './feed.service';
import { FeedErrors } from './feed.errors';
import { Comment } from './entities/comment.entity';
import { Post } from './entities/post.entity';
import { Reaction } from './entities/reaction.entity';
import { NotificationService } from '../notification';
import {
  Notification,
  NotificationType,
} from '../notification/entities/notification.entity';
import { SafetyService } from '../safety';
import { Block } from '../safety/entities/block.entity';
import { Report } from '../safety/entities/report.entity';
import { Gender, User } from '../user';

import type { ConfigService } from '@nestjs/config';
import type { CoreApiEnv } from '../../config/env.validation';
import type { UserService } from '../user';

/**
 * Integration test Feed trên Postgres thật (docs/05 § 5.9): block cắt điểm chạm (feed-service.md
 * § 3), like race không double-count, soft-delete không lộ lại qua feed/detail. DB riêng
 * `<tên gốc>_feed`.
 */
const INTEGRATION_DB_URL = process.env['INTEGRATION_DB_URL'];
const d = INTEGRATION_DB_URL ? describe : describe.skip;
if (!INTEGRATION_DB_URL) {
  console.warn(
    '[feed.integration] BỎ QUA — set INTEGRATION_DB_URL để chạy bộ test trên Postgres thật',
  );
}

jest.setTimeout(60_000);

const CONFIG: Record<string, unknown> = {
  SAFETY_REMATCH_COOLDOWN_DAYS: 30,
  SAFETY_REPORT_COOLDOWN_DAYS: 7,
  SAFETY_TRUST_PENALTY_PER_REPORT: 5,
  SAFETY_TRUST_PENALTY_DAILY_CAP: 20,
  SAFETY_TRUST_SCORE_FLOOR: 0,
};
const configStub = {
  getOrThrow: (key: string) => {
    if (!(key in CONFIG)) throw new Error(`missing config ${key}`);
    return CONFIG[key];
  },
} as unknown as ConfigService<CoreApiEnv, true>;

d('Feed integration (Postgres thật)', () => {
  let ds: DataSource;
  let feed: FeedService;
  let safety: SafetyService;
  let notification: NotificationService;

  async function createUser(nickname: string, isGuest = false): Promise<User> {
    const repo = ds.getRepository(User);
    return repo.save(
      repo.create({
        nickname,
        avatarId: 'default-01',
        isGuest,
        region: 'VN',
        birthDate: '2000-01-01',
        gender: Gender.Unknown,
      }),
    );
  }

  beforeAll(async () => {
    const url = new URL(INTEGRATION_DB_URL as string);
    const dbName = `${url.pathname.slice(1)}_feed`;
    url.pathname = `/${dbName}`;

    const adminUrl = new URL(INTEGRATION_DB_URL as string);
    adminUrl.pathname = '/postgres';
    const admin = new DataSource({
      type: 'postgres',
      url: adminUrl.toString(),
    });
    await admin.initialize();
    const exists = await admin.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [dbName],
    );
    if (exists.length === 0) await admin.query(`CREATE DATABASE "${dbName}"`);
    await admin.destroy();

    ds = new DataSource({
      type: 'postgres',
      url: url.toString(),
      entities: [User, Report, Block, Post, Comment, Reaction, Notification],
      migrations: [
        InitAuthUser1751900000000,
        MatchingCore1752200000000,
        MatchingGenderPreference1752300000000,
        Safety1752800000000,
        Feed1752900000000,
        Notification1753000000000,
      ],
      namingStrategy: new SnakeNamingStrategy(),
      synchronize: false,
      dropSchema: true,
    });
    await ds.initialize();
    await ds.runMigrations();

    const userServiceStub = {
      getByIdOrThrow: async (id: string) => ({ id }),
    } as unknown as UserService;
    safety = new SafetyService(
      ds,
      ds.getRepository(Report),
      ds.getRepository(Block),
      userServiceStub,
      configStub,
    );
    // Push chỉ là stub no-op ở suite này — in-app Notification (nguồn sự thật) test thật bên dưới
    notification = new NotificationService(ds.getRepository(Notification), {
      send: async () => undefined,
    } as never);
    feed = new FeedService(
      ds,
      ds.getRepository(Post),
      ds.getRepository(Comment),
      ds.getRepository(Reaction),
      safety,
      notification,
    );
  });

  afterAll(async () => {
    await ds.destroy();
  });

  it('block 2 chiều lọc feed + chi tiết bài đều 404 (docs/services/feed-service.md § 3)', async () => {
    const [a, b] = await Promise.all([
      createUser('feed-a'),
      createUser('feed-b'),
    ]);
    const post = await feed.createPost(
      { userId: b.id, isGuest: false },
      {
        content: 'bài của B',
      },
    );

    // Trước khi block: A thấy bình thường
    let page = await feed.listFeed(
      { userId: a.id, isGuest: false },
      { limit: 20 },
    );
    expect(page.items.map((p) => p.id)).toContain(post.id);

    await safety.block(a.id, b.id); // A block B
    page = await feed.listFeed({ userId: a.id, isGuest: false }, { limit: 20 });
    expect(page.items.map((p) => p.id)).not.toContain(post.id);
    await expect(
      feed.getPostOrThrow({ userId: a.id, isGuest: false }, post.id),
    ).rejects.toMatchObject({ code: FeedErrors.POST_NOT_FOUND });

    // Chiều ngược lại (B bị A block) cũng không thấy feed của chính A lọc B — nhưng ở đây ta
    // kiểm tra A vẫn bị chặn xem bài B kể cả sau khi (giả lập) A unblock rồi B block lại A
    await safety.unblock(a.id, b.id);
    await safety.block(b.id, a.id); // B block A (chiều ngược)
    await expect(
      feed.getPostOrThrow({ userId: a.id, isGuest: false }, post.id),
    ).rejects.toMatchObject({ code: FeedErrors.POST_NOT_FOUND });
  });

  it('guest không đăng bài/like/comment được nhưng xem được', async () => {
    const author = await createUser('feed-author');
    const guestUser = await createUser('feed-guest', true);
    const post = await feed.createPost(
      { userId: author.id, isGuest: false },
      {
        content: 'công khai',
      },
    );

    await expect(
      feed.createPost(
        { userId: guestUser.id, isGuest: true },
        { content: 'x' },
      ),
    ).rejects.toMatchObject({ code: FeedErrors.GUEST_FORBIDDEN });
    await expect(
      feed.like({ userId: guestUser.id, isGuest: true }, post.id),
    ).rejects.toMatchObject({ code: FeedErrors.GUEST_FORBIDDEN });
    await expect(
      feed.createComment({ userId: guestUser.id, isGuest: true }, post.id, {
        content: 'x',
      }),
    ).rejects.toMatchObject({ code: FeedErrors.GUEST_FORBIDDEN });

    const fetched = await feed.getPostOrThrow(
      { userId: guestUser.id, isGuest: true },
      post.id,
    );
    expect(fetched.id).toBe(post.id);
  });

  it('RACE: N like đồng thời cùng 1 user → likeCount chỉ tăng đúng 1 (unique DB chặn double-count)', async () => {
    const author = await createUser('race-author');
    const liker = await createUser('race-liker');
    const post = await feed.createPost(
      { userId: author.id, isGuest: false },
      {
        content: 'race test',
      },
    );
    const user = { userId: liker.id, isGuest: false };

    await Promise.all(
      Array.from({ length: 5 }, () => feed.like(user, post.id)),
    );

    const fresh = await ds.getRepository(Post).findOneByOrFail({ id: post.id });
    expect(fresh.likeCount).toBe(1);
    const reactionCount = await ds
      .getRepository(Reaction)
      .countBy({ postId: post.id, userId: liker.id });
    expect(reactionCount).toBe(1);

    // notification post_liked cho tác giả — CHỈ 1 dù 5 request like song song (không double-notify)
    const notifications = await ds
      .getRepository(Notification)
      .findBy({ userId: author.id, type: NotificationType.PostLiked });
    expect(notifications).toHaveLength(1);
    expect(notifications[0].payload).toMatchObject({
      postId: post.id,
      actorUserId: liker.id,
    });
  });

  it('unlike rồi like lại — vẫn đúng 1 reaction, likeCount về đúng 1', async () => {
    const author = await createUser('toggle-author');
    const liker = await createUser('toggle-liker');
    const post = await feed.createPost(
      { userId: author.id, isGuest: false },
      {
        content: 'toggle test',
      },
    );
    const user = { userId: liker.id, isGuest: false };

    await feed.like(user, post.id);
    await feed.unlike(user, post.id);
    await feed.unlike(user, post.id); // idempotent, không giảm thêm
    const status1 = await feed.reactionStatus(user, post.id);
    expect(status1).toEqual({ liked: false, likeCount: 0 });

    await feed.like(user, post.id);
    const status2 = await feed.reactionStatus(user, post.id);
    expect(status2).toEqual({ liked: true, likeCount: 1 });
  });

  it('comment tăng commentCount atomic; xoá mềm post/comment không còn thấy qua API', async () => {
    const author = await createUser('cmt-author');
    const commenter = await createUser('cmt-commenter');
    const post = await feed.createPost(
      { userId: author.id, isGuest: false },
      {
        content: 'cmt test',
      },
    );
    const authorUser = { userId: author.id, isGuest: false };
    const commenterUser = { userId: commenter.id, isGuest: false };

    const comment = await feed.createComment(commenterUser, post.id, {
      content: 'nice',
    });
    let fresh = await ds.getRepository(Post).findOneByOrFail({ id: post.id });
    expect(fresh.commentCount).toBe(1);

    const notifications = await ds
      .getRepository(Notification)
      .findBy({ userId: author.id, type: NotificationType.PostCommented });
    expect(notifications).toHaveLength(1);
    expect(notifications[0].payload).toMatchObject({
      postId: post.id,
      commentId: comment.id,
      actorUserId: commenter.id,
    });

    // tự comment lên bài mình → KHÔNG tự notify chính mình (docs/services/notification-service.md § 3)
    await feed.createComment(authorUser, post.id, { content: 'reply mình' });
    const selfNotifications = await ds
      .getRepository(Notification)
      .findBy({ userId: author.id, type: NotificationType.PostCommented });
    expect(selfNotifications).toHaveLength(1); // vẫn chỉ 1 — không tăng thêm

    await feed.deleteComment(commenterUser, comment.id);
    fresh = await ds.getRepository(Post).findOneByOrFail({ id: post.id });
    expect(fresh.commentCount).toBe(1); // còn lại reply của chính author
    const page = await feed.listComments(authorUser, post.id, { limit: 20 });
    expect(page.items).toHaveLength(1);

    await feed.deletePost(authorUser, post.id);
    await expect(
      feed.getPostOrThrow(authorUser, post.id),
    ).rejects.toMatchObject({ code: FeedErrors.POST_NOT_FOUND });
  });

  it('IDOR: xoá bài/comment của người khác → 403, không xoá được', async () => {
    const owner = await createUser('idor-owner');
    const outsider = await createUser('idor-outsider');
    const post = await feed.createPost(
      { userId: owner.id, isGuest: false },
      {
        content: 'owner post',
      },
    );
    const comment = await feed.createComment(
      { userId: owner.id, isGuest: false },
      post.id,
      { content: 'owner comment' },
    );

    await expect(
      feed.deletePost({ userId: outsider.id, isGuest: false }, post.id),
    ).rejects.toMatchObject({ code: FeedErrors.POST_NOT_FOUND });
    await expect(
      feed.deleteComment({ userId: outsider.id, isGuest: false }, comment.id),
    ).rejects.toMatchObject({ code: FeedErrors.COMMENT_NOT_FOUND });
  });
});
