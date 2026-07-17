import { DataSource } from 'typeorm';

import { SnakeNamingStrategy } from '../../database/snake-naming.strategy';
import { InitAuthUser1751900000000 } from '../../database/migrations/1751900000000-init-auth-user';
import { UserProfilePreferences1755800000000 } from '../../database/migrations/1755800000000-user-profile-preferences';
import { UserRole1753600000000 } from '../../database/migrations/1753600000000-user-role';
import { MatchingCore1752200000000 } from '../../database/migrations/1752200000000-matching-core';
import { MatchingGenderPreference1752300000000 } from '../../database/migrations/1752300000000-matching-gender-preference';
import { SoulMatch1752400000000 } from '../../database/migrations/1752400000000-soul-match';
import { FriendChat1752600000000 } from '../../database/migrations/1752600000000-friend-chat';
import { Safety1752800000000 } from '../../database/migrations/1752800000000-safety';
import { ReportTargetVideo1754900000000 } from '../../database/migrations/1754900000000-report-target-video';
import { Feed1752900000000 } from '../../database/migrations/1752900000000-feed';
import { Notification1753000000000 } from '../../database/migrations/1753000000000-notification';
import { ConversationStreak1754200000000 } from '../../database/migrations/1754200000000-conversation-streak';
import { FeedAudience1754300000000 } from '../../database/migrations/1754300000000-feed-audience';
import { MessageAttachment1754400000000 } from '../../database/migrations/1754400000000-message-attachment';
import { Story1754500000000 } from '../../database/migrations/1754500000000-story';

import { FeedService } from './feed.service';
import { FeedErrors } from './feed.errors';
import { Comment } from './entities/comment.entity';
import { Post, PostAudience } from './entities/post.entity';
import { Reaction } from './entities/reaction.entity';
import { Story, StoryAudience } from './entities/story.entity';
import { StoryView } from './entities/story-view.entity';
import { StoryService } from './services/story.service';
import { Conversation } from '../friend/entities/conversation.entity';
import { ConversationStreak } from '../friend/entities/conversation-streak.entity';
import {
  Friendship,
  FriendshipSource,
} from '../friend/entities/friendship.entity';
import { Message } from '../friend/entities/message.entity';
import { FriendService } from '../friend/friend.service';
import { ConversationService } from '../friend/services/conversation.service';
import { StreakService } from '../friend/services/streak.service';
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
  FRIEND_MESSAGE_MAX_LENGTH: 2000,
  STREAK_MILESTONE_DAYS: '3,7,14,30,50,100',
  STREAK_WARNING_HOURS: 0,
  STORY_TTL_HOURS: 24,
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
  let friend: FriendService;
  let story: StoryService;

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

  async function makeFriends(a: User, b: User): Promise<void> {
    await ds.transaction((manager) =>
      friend.ensureFriendship(manager, a.id, b.id, FriendshipSource.SoulMatch),
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
      entities: [
        User,
        Report,
        Block,
        Post,
        Comment,
        Reaction,
        Notification,
        Friendship,
        Conversation,
        Message,
        ConversationStreak,
        Story,
        StoryView,
      ],
      migrations: [
        InitAuthUser1751900000000,
        UserProfilePreferences1755800000000,
        UserRole1753600000000,
        MatchingCore1752200000000,
        MatchingGenderPreference1752300000000,
        SoulMatch1752400000000,
        FriendChat1752600000000,
        Safety1752800000000,
        ReportTargetVideo1754900000000,
        Feed1752900000000,
        Notification1753000000000,
        ConversationStreak1754200000000,
        FeedAudience1754300000000,
        MessageAttachment1754400000000,
        Story1754500000000,
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
    const conversationService = new ConversationService(
      ds.getRepository(Conversation),
      ds.getRepository(Message),
    );
    const streakService = new StreakService(
      ds,
      ds.getRepository(ConversationStreak),
      configStub,
    );
    friend = new FriendService(
      ds.getRepository(Friendship),
      // member state (read/mute) không dùng ở suite này — stub rỗng
      { findOne: async () => null } as never,
      conversationService,
      streakService,
      safety,
      notification as never,
      configStub,
      // stub publish — realtime friend.message/streak không phải trọng tâm suite này
      { publish: async () => 1 } as never,
    );
    feed = new FeedService(
      ds,
      ds.getRepository(Post),
      ds.getRepository(Comment),
      ds.getRepository(Reaction),
      safety,
      friend,
      notification,
    );
    story = new StoryService(
      ds.getRepository(Story),
      ds.getRepository(StoryView),
      friend,
      safety,
      configStub,
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
      { userId: b.id, isGuest: false, role: 'user' },
      {
        content: 'bài của B',
      },
      'k-block',
    );

    // Trước khi block: A thấy bình thường
    let page = await feed.listFeed(
      { userId: a.id, isGuest: false, role: 'user' },
      { limit: 20 },
    );
    expect(page.items.map((p) => p.id)).toContain(post.id);

    await safety.block(a.id, b.id); // A block B
    page = await feed.listFeed(
      { userId: a.id, isGuest: false, role: 'user' },
      { limit: 20 },
    );
    expect(page.items.map((p) => p.id)).not.toContain(post.id);
    await expect(
      feed.getPostOrThrow(
        { userId: a.id, isGuest: false, role: 'user' },
        post.id,
      ),
    ).rejects.toMatchObject({ code: FeedErrors.POST_NOT_FOUND });

    // Chiều ngược lại (B bị A block) cũng không thấy feed của chính A lọc B — nhưng ở đây ta
    // kiểm tra A vẫn bị chặn xem bài B kể cả sau khi (giả lập) A unblock rồi B block lại A
    await safety.unblock(a.id, b.id);
    await safety.block(b.id, a.id); // B block A (chiều ngược)
    await expect(
      feed.getPostOrThrow(
        { userId: a.id, isGuest: false, role: 'user' },
        post.id,
      ),
    ).rejects.toMatchObject({ code: FeedErrors.POST_NOT_FOUND });
  });

  it('guest không đăng bài/like/comment được nhưng xem được', async () => {
    const author = await createUser('feed-author');
    const guestUser = await createUser('feed-guest', true);
    const post = await feed.createPost(
      { userId: author.id, isGuest: false, role: 'user' },
      {
        content: 'công khai',
      },
      'k-guest',
    );

    await expect(
      feed.createPost(
        { userId: guestUser.id, isGuest: true, role: 'user' },
        { content: 'x' },
        'k-guest-2',
      ),
    ).rejects.toMatchObject({ code: FeedErrors.GUEST_FORBIDDEN });
    await expect(
      feed.like({ userId: guestUser.id, isGuest: true, role: 'user' }, post.id),
    ).rejects.toMatchObject({ code: FeedErrors.GUEST_FORBIDDEN });
    await expect(
      feed.createComment(
        { userId: guestUser.id, isGuest: true, role: 'user' },
        post.id,
        {
          content: 'x',
        },
      ),
    ).rejects.toMatchObject({ code: FeedErrors.GUEST_FORBIDDEN });

    const fetched = await feed.getPostOrThrow(
      { userId: guestUser.id, isGuest: true, role: 'user' },
      post.id,
    );
    expect(fetched.id).toBe(post.id);
  });

  it('RACE: N like đồng thời cùng 1 user → likeCount chỉ tăng đúng 1 (unique DB chặn double-count)', async () => {
    const author = await createUser('race-author');
    const liker = await createUser('race-liker');
    const post = await feed.createPost(
      { userId: author.id, isGuest: false, role: 'user' },
      {
        content: 'race test',
      },
      'k-race',
    );
    const user = { userId: liker.id, isGuest: false, role: 'user' } as const;

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
      { userId: author.id, isGuest: false, role: 'user' },
      {
        content: 'toggle test',
      },
      'k-toggle',
    );
    const user = { userId: liker.id, isGuest: false, role: 'user' } as const;

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
      { userId: author.id, isGuest: false, role: 'user' },
      {
        content: 'cmt test',
      },
      'k-cmt',
    );
    const authorUser = {
      userId: author.id,
      isGuest: false,
      role: 'user',
    } as const;
    const commenterUser = {
      userId: commenter.id,
      isGuest: false,
      role: 'user',
    } as const;

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
      { userId: owner.id, isGuest: false, role: 'user' },
      {
        content: 'owner post',
      },
      'k-idor',
    );
    const comment = await feed.createComment(
      { userId: owner.id, isGuest: false, role: 'user' },
      post.id,
      { content: 'owner comment' },
    );

    await expect(
      feed.deletePost(
        { userId: outsider.id, isGuest: false, role: 'user' },
        post.id,
      ),
    ).rejects.toMatchObject({ code: FeedErrors.POST_NOT_FOUND });
    await expect(
      feed.deleteComment(
        { userId: outsider.id, isGuest: false, role: 'user' },
        comment.id,
      ),
    ).rejects.toMatchObject({ code: FeedErrors.COMMENT_NOT_FOUND });
  });

  it('idempotency-key trùng (retry mạng) → không tạo 2 bài, trả lại post cũ', async () => {
    const author = await createUser('idem-author');
    const user = { userId: author.id, isGuest: false, role: 'user' } as const;

    const first = await feed.createPost(
      user,
      { content: 'idem test' },
      'same-key',
    );
    const second = await feed.createPost(
      user,
      { content: 'idem test' },
      'same-key',
    );
    expect(second.id).toBe(first.id);

    const count = await ds
      .getRepository(Post)
      .countBy({ authorUserId: author.id });
    expect(count).toBe(1);
  });

  it('idempotency-key trùng nhưng nội dung khác → 409, không tạo bài mới', async () => {
    const author = await createUser('idem-conflict-author');
    const user = { userId: author.id, isGuest: false, role: 'user' } as const;

    await feed.createPost(user, { content: 'bản gốc' }, 'same-key-2');
    await expect(
      feed.createPost(user, { content: 'bản khác' }, 'same-key-2'),
    ).rejects.toMatchObject({ code: FeedErrors.POST_IDEMPOTENCY_CONFLICT });
  });

  it('audience: feed toàn cục CHỈ hiện public — bài friends/only_me không lộ ra', async () => {
    const author = await createUser('aud-author');
    const stranger = await createUser('aud-stranger');
    const publicPost = await feed.createPost(
      { userId: author.id, isGuest: false, role: 'user' },
      { content: 'public', audience: PostAudience.Public },
      'k-aud-public',
    );
    const friendsPost = await feed.createPost(
      { userId: author.id, isGuest: false, role: 'user' },
      { content: 'friends only', audience: PostAudience.Friends },
      'k-aud-friends',
    );
    const onlyMePost = await feed.createPost(
      { userId: author.id, isGuest: false, role: 'user' },
      { content: 'chi minh', audience: PostAudience.OnlyMe },
      'k-aud-only-me',
    );

    const page = await feed.listFeed(
      { userId: stranger.id, isGuest: false, role: 'user' },
      { limit: 20 },
    );
    const ids = page.items.map((p) => p.id);
    expect(ids).toContain(publicPost.id);
    expect(ids).not.toContain(friendsPost.id);
    expect(ids).not.toContain(onlyMePost.id);
  });

  it('audience friends: người lạ không thấy, bạn bè thấy được, tác giả luôn thấy hết qua timeline', async () => {
    const author = await createUser('tl-author');
    const friendUser = await createUser('tl-friend');
    const stranger = await createUser('tl-stranger');
    await makeFriends(author, friendUser);

    const publicPost = await feed.createPost(
      { userId: author.id, isGuest: false, role: 'user' },
      { content: 'public', audience: PostAudience.Public },
      'k-tl-public',
    );
    const friendsPost = await feed.createPost(
      { userId: author.id, isGuest: false, role: 'user' },
      { content: 'friends only', audience: PostAudience.Friends },
      'k-tl-friends',
    );
    const onlyMePost = await feed.createPost(
      { userId: author.id, isGuest: false, role: 'user' },
      { content: 'chi minh', audience: PostAudience.OnlyMe },
      'k-tl-only-me',
    );

    const strangerView = await feed.listUserTimeline(
      { userId: stranger.id, isGuest: false, role: 'user' },
      author.id,
      { limit: 20 },
    );
    expect(strangerView.items.map((p) => p.id)).toEqual([publicPost.id]);

    const friendView = await feed.listUserTimeline(
      { userId: friendUser.id, isGuest: false, role: 'user' },
      author.id,
      { limit: 20 },
    );
    expect(friendView.items.map((p) => p.id).sort()).toEqual(
      [publicPost.id, friendsPost.id].sort(),
    );

    const selfView = await feed.listUserTimeline(
      { userId: author.id, isGuest: false, role: 'user' },
      author.id,
      { limit: 20 },
    );
    expect(selfView.items.map((p) => p.id).sort()).toEqual(
      [publicPost.id, friendsPost.id, onlyMePost.id].sort(),
    );

    // Đi thẳng URL GET /posts/:id cũng bị chặn audience, không riêng gì timeline
    await expect(
      feed.getPostOrThrow(
        { userId: stranger.id, isGuest: false, role: 'user' },
        onlyMePost.id,
      ),
    ).rejects.toMatchObject({ code: FeedErrors.POST_NOT_FOUND });
  });

  it('timeline: block 2 chiều → trả rỗng dù có bài public (giống hệt 0 bài, không lộ block)', async () => {
    const author = await createUser('tl-block-author');
    const blocker = await createUser('tl-block-viewer');
    await feed.createPost(
      { userId: author.id, isGuest: false, role: 'user' },
      { content: 'public' },
      'k-tl-block',
    );
    await safety.block(blocker.id, author.id);

    const page = await feed.listUserTimeline(
      { userId: blocker.id, isGuest: false, role: 'user' },
      author.id,
      { limit: 20 },
    );
    expect(page.items).toHaveLength(0);
  });

  describe('stories (docs/services/feed-service.md § 8)', () => {
    it('ring: chỉ thấy story của mình + bạn bè, không thấy người lạ', async () => {
      const [me, friendUser, stranger] = await Promise.all([
        createUser('st-ring-me'),
        createUser('st-ring-friend'),
        createUser('st-ring-stranger'),
      ]);
      await makeFriends(me, friendUser);
      const meUser = { userId: me.id, isGuest: false, role: 'user' } as const;

      const myStory = await story.createStory(
        meUser,
        { mediaUrl: 'https://cdn.example/me.jpg' },
        'k-ring-me',
      );
      const friendStory = await story.createStory(
        { userId: friendUser.id, isGuest: false, role: 'user' },
        { mediaUrl: 'https://cdn.example/friend.jpg' },
        'k-ring-friend',
      );
      await story.createStory(
        { userId: stranger.id, isGuest: false, role: 'user' },
        { mediaUrl: 'https://cdn.example/stranger.jpg' },
        'k-ring-stranger',
      );

      const ring = await story.getRing(meUser);
      const ids = ring.map((s) => s.id);
      expect(ids).toContain(myStory.id);
      expect(ids).toContain(friendStory.id);
      expect(ids).toHaveLength(2);
    });

    it('idempotency-key trùng cùng mediaUrl → trả lại story cũ, không tạo đôi', async () => {
      const author = await createUser('st-idem-author');
      const user = { userId: author.id, isGuest: false, role: 'user' } as const;
      const first = await story.createStory(
        user,
        { mediaUrl: 'https://cdn.example/idem.jpg' },
        'same-key',
      );
      const second = await story.createStory(
        user,
        { mediaUrl: 'https://cdn.example/idem.jpg' },
        'same-key',
      );
      expect(second.id).toBe(first.id);
      const count = await ds
        .getRepository(Story)
        .countBy({ authorUserId: author.id });
      expect(count).toBe(1);
    });

    it('audience=friends: người lạ trực tiếp GET /:id → 404; bạn bè xem được', async () => {
      const [author, friendUser, stranger] = await Promise.all([
        createUser('st-view-author'),
        createUser('st-view-friend'),
        createUser('st-view-stranger'),
      ]);
      await makeFriends(author, friendUser);
      const s = await story.createStory(
        { userId: author.id, isGuest: false, role: 'user' },
        {
          mediaUrl: 'https://cdn.example/v.jpg',
          audience: StoryAudience.Friends,
        },
        'k-view',
      );

      await expect(
        story.getStoryOrThrow(
          { userId: stranger.id, isGuest: false, role: 'user' },
          s.id,
        ),
      ).rejects.toMatchObject({ code: FeedErrors.STORY_NOT_FOUND });

      const seen = await story.viewStory(
        { userId: friendUser.id, isGuest: false, role: 'user' },
        s.id,
      );
      expect(seen.id).toBe(s.id);
    });

    it('story hết hạn (giả lập expiresAt quá khứ) → 404 dù đúng audience', async () => {
      const author = await createUser('st-expired-author');
      const s = await story.createStory(
        { userId: author.id, isGuest: false, role: 'user' },
        { mediaUrl: 'https://cdn.example/exp.jpg' },
        'k-expired',
      );
      await ds
        .getRepository(Story)
        .update({ id: s.id }, { expiresAt: new Date(Date.now() - 1000) });

      await expect(
        story.getStoryOrThrow(
          { userId: author.id, isGuest: false, role: 'user' },
          s.id,
        ),
      ).rejects.toMatchObject({ code: FeedErrors.STORY_NOT_FOUND });
    });

    it('self-view không tạo StoryView, view người khác thì có + tác giả xem được viewers', async () => {
      const [author, viewer] = await Promise.all([
        createUser('st-viewers-author'),
        createUser('st-viewers-viewer'),
      ]);
      await makeFriends(author, viewer);
      const authorUser = {
        userId: author.id,
        isGuest: false,
        role: 'user',
      } as const;
      const s = await story.createStory(
        authorUser,
        { mediaUrl: 'https://cdn.example/vw.jpg' },
        'k-viewers',
      );

      await story.viewStory(authorUser, s.id); // tự xem — không đếm
      await story.viewStory(
        { userId: viewer.id, isGuest: false, role: 'user' },
        s.id,
      );
      await story.viewStory(
        { userId: viewer.id, isGuest: false, role: 'user' },
        s.id,
      ); // xem lại — idempotent

      const viewerIds = await story.listViewers(authorUser, s.id);
      expect(viewerIds).toEqual([viewer.id]);

      const viewCount = await ds
        .getRepository(StoryView)
        .countBy({ storyId: s.id });
      expect(viewCount).toBe(1);
    });

    it('listViewers lọc bỏ viewer đã bị tác giả block SAU KHI xem (lọc lúc đọc)', async () => {
      const [author, viewer] = await Promise.all([
        createUser('st-viewers-block-author'),
        createUser('st-viewers-block-viewer'),
      ]);
      await makeFriends(author, viewer);
      const authorUser = {
        userId: author.id,
        isGuest: false,
        role: 'user',
      } as const;
      const s = await story.createStory(
        authorUser,
        { mediaUrl: 'https://cdn.example/vwb.jpg' },
        'k-viewers-block',
      );
      await story.viewStory(
        { userId: viewer.id, isGuest: false, role: 'user' },
        s.id,
      );

      await safety.block(author.id, viewer.id);
      const viewerIds = await story.listViewers(authorUser, s.id);
      expect(viewerIds).toEqual([]);
    });

    it('reply story → DM thật qua FriendService, attachment snapshot mediaUrl', async () => {
      const [author, friendUser] = await Promise.all([
        createUser('st-reply-author'),
        createUser('st-reply-friend'),
      ]);
      await makeFriends(author, friendUser);
      const s = await story.createStory(
        { userId: author.id, isGuest: false, role: 'user' },
        { mediaUrl: 'https://cdn.example/reply.jpg' },
        'k-reply-story',
      );

      const message = await story.replyToStory(
        { userId: friendUser.id, isGuest: false, role: 'user' },
        s.id,
        'story dep qua',
        'k-reply-msg',
      );
      expect(message.attachment).toEqual({
        kind: 'story_reply',
        payload: { storyId: s.id, mediaUrl: 'https://cdn.example/reply.jpg' },
      });

      // Đi trọn pipeline Friend Chat thật — message thật sự nằm trong conversation của 2 người
      const conv = await friend.getConversationWithFriend(
        author.id,
        friendUser.id,
      );
      const page = await friend.listMessages(author.id, conv.id, 20);
      expect(page.items.map((m) => m.id)).toContain(message.id);
    });

    it('block 2 chiều → getStoryOrThrow 404 dù đúng audience/còn hạn', async () => {
      const [author, blocker] = await Promise.all([
        createUser('st-block-author'),
        createUser('st-block-viewer'),
      ]);
      const s = await story.createStory(
        { userId: author.id, isGuest: false, role: 'user' },
        {
          mediaUrl: 'https://cdn.example/blk.jpg',
          audience: StoryAudience.Public,
        },
        'k-story-block',
      );
      await safety.block(blocker.id, author.id);

      await expect(
        story.getStoryOrThrow(
          { userId: blocker.id, isGuest: false, role: 'user' },
          s.id,
        ),
      ).rejects.toMatchObject({ code: FeedErrors.STORY_NOT_FOUND });
    });
  });
});
