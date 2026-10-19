import Redis from 'ioredis';
import { DataSource } from 'typeorm';

import { SnakeNamingStrategy } from '../../database/snake-naming.strategy';
import { InitAuthUser1751900000000 } from '../../database/migrations/1751900000000-init-auth-user';
import { UserProfilePreferences1755800000000 } from '../../database/migrations/1755800000000-user-profile-preferences';
import { UserRole1753600000000 } from '../../database/migrations/1753600000000-user-role';
import { MatchingCore1752200000000 } from '../../database/migrations/1752200000000-matching-core';
import { MatchingGenderPreference1752300000000 } from '../../database/migrations/1752300000000-matching-gender-preference';
import { Safety1752800000000 } from '../../database/migrations/1752800000000-safety';
import { ReportStatus1753800000000 } from '../../database/migrations/1753800000000-report-status';
import { ReportTargetVideo1754900000000 } from '../../database/migrations/1754900000000-report-target-video';
import { ShortVideo1754800000000 } from '../../database/migrations/1754800000000-short-video';
import { VideoStorageCleanupMarker1757800000000 } from '../../database/migrations/1757800000000-video-storage-cleanup-marker';
import { ShortVideoRankingIndexes1758200000000 } from '../../database/migrations/1758200000000-short-video-ranking-indexes';

import { ShortVideoService } from './short-video.service';
import { ShortVideoErrors } from './short-video.errors';
import { VideoSweeperService } from './jobs/video-sweeper.service';
import { VideoRankingService } from './jobs/video-ranking.service';
import { VideoCounterFlushService } from './jobs/video-counter-flush.service';
import { Video, VideoStatus } from './entities/video.entity';
import { VideoView } from './entities/video-view.entity';
import { VideoComment } from './entities/video-comment.entity';
import { VideoReaction } from './entities/video-reaction.entity';
import { RedisVideoCounterBufferAdapter } from './redis/redis-video-counter-buffer.adapter';
import { DevVideoStorageAdapter } from './ports/dev-video-storage.adapter';
import { DevVideoTranscodeAdapter } from './ports/dev-video-transcode.adapter';
import { SafetyService, ReportReason } from '../safety';
import { Block } from '../safety/entities/block.entity';
import { Report } from '../safety/entities/report.entity';
import { User, UserService } from '../user';

import type { ConfigService } from '@nestjs/config';
import type { VideoCounterBufferPort } from './ports/video-counter-buffer.port';
import type { SchedulerRegistry } from '@nestjs/schedule';
import type { CoreApiEnv } from '../../config/env.validation';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

/**
 * Integration test short-video trên Postgres thật (docs/05 § 5.9): lifecycle upload đầy đủ,
 * view/like/comment counter atomic, report vượt ngưỡng auto-hide, sweeper + ranking job.
 * DB riêng `<tên gốc>_short_video`.
 */
const INTEGRATION_DB_URL = process.env['INTEGRATION_DB_URL'];
const d = INTEGRATION_DB_URL ? describe : describe.skip;
if (!INTEGRATION_DB_URL) {
  console.warn(
    '[short-video.integration] BỎ QUA — set INTEGRATION_DB_URL để chạy bộ test trên Postgres thật',
  );
}

jest.setTimeout(60_000);

const CONFIG: Record<string, unknown> = {
  SAFETY_REMATCH_COOLDOWN_DAYS: 30,
  SAFETY_REPORT_COOLDOWN_DAYS: 7,
  SAFETY_TRUST_PENALTY_PER_REPORT: 5,
  SAFETY_TRUST_PENALTY_DAILY_CAP: 20,
  SAFETY_TRUST_SCORE_FLOOR: 0,
  VIDEO_CAPTION_MAX_LENGTH: 500,
  VIDEO_UPLOAD_ENABLED: true,
  VIDEO_MODERATION_MODE: 'pre',
  VIDEO_QUALIFIED_VIEW_MIN_MS: 3000,
  VIDEO_UPLOAD_TIMEOUT_SECONDS: 3600,
  VIDEO_SWEEPER_INTERVAL_MS: 3_600_000,
  VIDEO_REPORT_AUTOHIDE_THRESHOLD: 3,
  VIDEO_RANK_WEIGHT_VIEW: 1,
  VIDEO_RANK_WEIGHT_LIKE: 3,
  VIDEO_RANK_WEIGHT_COMMENT: 5,
  VIDEO_RANK_TIME_DECAY_HOURS: 48,
  VIDEO_RANKING_JOB_INTERVAL_MS: 1_800_000,
  VIDEO_RANKING_BATCH_SIZE: 1_000,
  VIDEO_RANKING_MAX_BATCHES_PER_TICK: 5,
  VIDEO_COUNTER_BUFFER_ENABLED: false,
  VIDEO_COUNTER_FLUSH_INTERVAL_MS: 2_000,
  VIDEO_COUNTER_FLUSH_BATCH: 500,
  NODE_ENV: 'test',
};
const configStub = {
  getOrThrow: (key: string) => {
    if (!(key in CONFIG)) throw new Error(`missing config ${key}`);
    return CONFIG[key];
  },
  get: (key: string) => CONFIG[key],
} as unknown as ConfigService<CoreApiEnv, true>;
const schedulerStub = {
  addInterval: () => undefined,
  doesExist: () => false,
  deleteInterval: () => undefined,
} as unknown as SchedulerRegistry;

d('short-video integration (Postgres thật)', () => {
  let ds: DataSource;
  let video: ShortVideoService;
  let sweeper: VideoSweeperService;
  let ranking: VideoRankingService;
  let makeVideoService: (buffer?: VideoCounterBufferPort) => ShortVideoService;

  const auth = (userId: string): AuthenticatedUser => ({
    userId,
    isGuest: false,
    role: 'user',
  });

  async function createUser(nickname: string): Promise<User> {
    const repo = ds.getRepository(User);
    return repo.save(
      repo.create({
        nickname,
        avatarId: 'default-01',
        isGuest: false,
        birthDate: '2000-01-01',
      }),
    );
  }

  async function uploadAndPublish(authorId: string): Promise<Video> {
    const { video: v } = await video.createUploadIntent(
      auth(authorId),
      {},
      `upload-${authorId}-${Math.random()}`,
    );
    await video.finalizeUpload(auth(authorId), v.id);
    return video.adminApprove(v.id);
  }

  beforeAll(async () => {
    const url = new URL(INTEGRATION_DB_URL as string);
    const dbName = `${url.pathname.slice(1)}_short_video`;
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
        Video,
        VideoView,
        VideoComment,
        VideoReaction,
      ],
      migrations: [
        InitAuthUser1751900000000,
        UserProfilePreferences1755800000000,
        UserRole1753600000000,
        MatchingCore1752200000000,
        MatchingGenderPreference1752300000000,
        Safety1752800000000,
        ReportTargetVideo1754900000000,
        ReportStatus1753800000000,
        ShortVideo1754800000000,
        VideoStorageCleanupMarker1757800000000,
        ShortVideoRankingIndexes1758200000000,
      ],
      // Như data-source production: migration ranking tạo index CONCURRENTLY nên phải ngoài transaction.
      migrationsTransactionMode: 'each',
      namingStrategy: new SnakeNamingStrategy(),
      synchronize: false,
      dropSchema: true,
    });
    await ds.initialize();
    await ds.runMigrations();

    const userService = new UserService(ds.getRepository(User), configStub);
    const safetyService = new SafetyService(
      ds,
      ds.getRepository(Report),
      ds.getRepository(Block),
      userService,
      configStub,
    );
    const storagePort = new DevVideoStorageAdapter(configStub);
    const transcodePort = new DevVideoTranscodeAdapter(configStub);

    video = new ShortVideoService(
      ds,
      ds.getRepository(Video),
      ds.getRepository(VideoView),
      ds.getRepository(VideoComment),
      ds.getRepository(VideoReaction),
      storagePort,
      transcodePort,
      // Suite này không test feed=following (đã có unit test riêng) — stub graph bạn rỗng
      { listFriendIds: async () => [] } as never,
      safetyService,
      configStub,
    );
    sweeper = new VideoSweeperService(
      ds,
      storagePort,
      configStub,
      schedulerStub,
    );
    ranking = new VideoRankingService(ds, configStub, schedulerStub);
    makeVideoService = (buffer) =>
      new ShortVideoService(
        ds,
        ds.getRepository(Video),
        ds.getRepository(VideoView),
        ds.getRepository(VideoComment),
        ds.getRepository(VideoReaction),
        storagePort,
        transcodePort,
        { listFriendIds: async () => [] } as never,
        safetyService,
        configStub,
        buffer,
      );
  });

  afterAll(async () => {
    await ds?.destroy();
  });

  it('lifecycle đầy đủ: upload → finalize (pre mode → pending_review) → admin approve → published', async () => {
    const author = await createUser('video-author-1');
    const { video: created, uploadUrl } = await video.createUploadIntent(
      auth(author.id),
      { caption: 'my first video' },
      'upload-key-1',
    );
    expect(created.status).toBe(VideoStatus.Uploading);
    expect(uploadUrl).toContain(created.storageKey);

    const processed = await video.finalizeUpload(auth(author.id), created.id);
    expect(processed.status).toBe(VideoStatus.PendingReview);
    expect(processed.playbackUrl).not.toBeNull();

    const published = await video.adminApprove(created.id);
    expect(published.status).toBe(VideoStatus.Published);
  });

  it('upload-intent idempotent — replay cùng Idempotency-Key không tạo video đôi', async () => {
    const author = await createUser('video-author-idem');
    const first = await video.createUploadIntent(
      auth(author.id),
      { caption: 'idem test' },
      'idem-key-1',
    );
    const replay = await video.createUploadIntent(
      auth(author.id),
      { caption: 'idem test' },
      'idem-key-1',
    );
    expect(replay.video.id).toBe(first.video.id);
    expect(
      await ds.getRepository(Video).countBy({ authorUserId: author.id }),
    ).toBe(1);
  });

  it('upload-intent replay sau khi video đã finalize → 409, không cấp lại URL (không thay được file đã duyệt)', async () => {
    const author = await createUser('video-author-replay-late');
    const { video: created } = await video.createUploadIntent(
      auth(author.id),
      { caption: 'late replay' },
      'late-replay-key',
    );
    await video.finalizeUpload(auth(author.id), created.id);

    await expect(
      video.createUploadIntent(
        auth(author.id),
        { caption: 'late replay' },
        'late-replay-key',
      ),
    ).rejects.toMatchObject({
      code: ShortVideoErrors.VIDEO_INVALID_TRANSITION,
    });
  });

  it('người ngoài không xem được video pending_review (oracle-safe), tác giả xem được', async () => {
    const author = await createUser('video-author-hidden');
    const stranger = await createUser('video-stranger-hidden');
    const { video: created } = await video.createUploadIntent(
      auth(author.id),
      {},
      'hidden-key-1',
    );
    await video.finalizeUpload(auth(author.id), created.id);

    await expect(
      video.getVideoOrThrow(auth(stranger.id), created.id),
    ).rejects.toMatchObject({ code: ShortVideoErrors.VIDEO_NOT_FOUND });
    const seenByAuthor = await video.getVideoOrThrow(
      auth(author.id),
      created.id,
    );
    expect(seenByAuthor.status).toBe(VideoStatus.PendingReview);
  });

  it('view: self-view không đếm, qualified chỉ cộng viewCount đúng 1 lần', async () => {
    const author = await createUser('video-author-view');
    const viewer1 = await createUser('video-viewer-1');
    const published = await uploadAndPublish(author.id);

    await video.recordView(auth(author.id), published.id, 10_000); // self-view
    await video.recordView(auth(viewer1.id), published.id, 1_000); // chưa qualified
    await video.recordView(auth(viewer1.id), published.id, 5_000); // qualified lần đầu
    await video.recordView(auth(viewer1.id), published.id, 8_000); // đã qualified — không cộng nữa

    const reloaded = await ds
      .getRepository(Video)
      .findOneByOrFail({ id: published.id });
    expect(reloaded.viewCount).toBe(1);
  });

  it('view: nhiều request đồng thời của cùng viewer chỉ cộng viewCount 1 lần và không lỗi', async () => {
    const author = await createUser('video-author-view-race');
    const viewer = await createUser('video-viewer-race');
    const published = await uploadAndPublish(author.id);

    // cả lần đầu tiên (chưa có hàng video_views) lẫn khi hàng đã tồn tại đều phải an toàn
    await Promise.all(
      Array.from({ length: 6 }, () =>
        video.recordView(auth(viewer.id), published.id, 5_000),
      ),
    );

    const reloaded = await ds
      .getRepository(Video)
      .findOneByOrFail({ id: published.id });
    expect(reloaded.viewCount).toBe(1);
    expect(
      await ds
        .getRepository(VideoView)
        .countBy({ videoId: published.id, viewerId: viewer.id }),
    ).toBe(1);
  });

  it('view: request vượt ngưỡng chờ khoá hàng của giao dịch đang qualify rồi không cộng lần nữa (FOR UPDATE)', async () => {
    const author = await createUser('video-author-view-lock');
    const viewer = await createUser('video-viewer-lock');
    const published = await uploadAndPublish(author.id);
    await video.recordView(auth(viewer.id), published.id, 500); // tạo hàng, chưa qualified
    const viewRow = await ds
      .getRepository(VideoView)
      .findOneByOrFail({ videoId: published.id, viewerId: viewer.id });

    let releaseA!: () => void;
    const holdA = new Promise<void>((resolve) => {
      releaseA = resolve;
    });
    let lockedByA!: () => void;
    const aHoldsLock = new Promise<void>((resolve) => {
      lockedByA = resolve;
    });
    // Giao dịch A: khoá hàng view, qualify + cộng viewCount, giữ khoá cho tới khi test cho commit.
    const txA = ds.transaction(async (manager) => {
      await manager.findOneOrFail(VideoView, {
        where: { id: viewRow.id },
        lock: { mode: 'pessimistic_write' },
      });
      lockedByA();
      await holdA;
      await manager.update(
        VideoView,
        { id: viewRow.id },
        { qualified: true, watchTimeMs: 5_000 },
      );
      await manager.increment(Video, { id: published.id }, 'viewCount', 1);
    });
    await aHoldsLock;

    // Request B cũng vượt ngưỡng. Có FOR UPDATE thì B chờ A, rồi thấy qualified=true và KHÔNG cộng.
    // Thiếu khoá thì B đọc qualified=false (đọc thường không bị chặn), chờ ở UPDATE rồi cộng thêm → 2.
    const txB = video.recordView(auth(viewer.id), published.id, 5_000);
    await new Promise((resolve) => setTimeout(resolve, 400));
    releaseA();
    await Promise.all([txA, txB]);

    const reloaded = await ds
      .getRepository(Video)
      .findOneByOrFail({ id: published.id });
    expect(reloaded.viewCount).toBe(1);
  });

  it('like/unlike idempotent, likeCount atomic', async () => {
    const author = await createUser('video-author-like');
    const liker = await createUser('video-liker-1');
    const published = await uploadAndPublish(author.id);

    const first = await video.like(auth(liker.id), published.id);
    const replay = await video.like(auth(liker.id), published.id);
    expect(first.likeCount).toBe(1);
    expect(replay.likeCount).toBe(1);

    const unliked = await video.unlike(auth(liker.id), published.id);
    expect(unliked.likeCount).toBe(0);
    const unlikedAgain = await video.unlike(auth(liker.id), published.id);
    expect(unlikedAgain.likeCount).toBe(0);
  });

  it('comment: tạo + xoá đúng quyền, commentCount atomic', async () => {
    const author = await createUser('video-author-comment');
    const commenter = await createUser('video-commenter-1');
    const stranger = await createUser('video-comment-stranger');
    const published = await uploadAndPublish(author.id);

    const comment = await video.createComment(
      auth(commenter.id),
      published.id,
      'nice video',
    );
    let reloaded = await ds
      .getRepository(Video)
      .findOneByOrFail({ id: published.id });
    expect(reloaded.commentCount).toBe(1);

    await expect(
      video.deleteComment(auth(stranger.id), published.id, comment.id),
    ).rejects.toMatchObject({ code: ShortVideoErrors.VIDEO_FORBIDDEN });

    // Tác giả VIDEO (không phải tác giả comment) cũng xoá được — quyền kiểm duyệt trên video của mình
    await video.deleteComment(auth(author.id), published.id, comment.id);
    reloaded = await ds
      .getRepository(Video)
      .findOneByOrFail({ id: published.id });
    expect(reloaded.commentCount).toBe(0);
  });

  it('report vượt VIDEO_REPORT_AUTOHIDE_THRESHOLD (3) → tự động ẩn (published→removed)', async () => {
    const author = await createUser('video-author-report');
    const [r1, r2, r3] = await Promise.all([
      createUser('video-reporter-1'),
      createUser('video-reporter-2'),
      createUser('video-reporter-3'),
    ]);
    const published = await uploadAndPublish(author.id);

    await video.reportVideo(
      auth(r1.id),
      published.id,
      ReportReason.InappropriateContent,
    );
    let reloaded = await ds
      .getRepository(Video)
      .findOneByOrFail({ id: published.id });
    expect(reloaded.status).toBe(VideoStatus.Published); // chưa đủ ngưỡng

    await video.reportVideo(
      auth(r2.id),
      published.id,
      ReportReason.InappropriateContent,
    );
    await video.reportVideo(
      auth(r3.id),
      published.id,
      ReportReason.InappropriateContent,
    );
    reloaded = await ds
      .getRepository(Video)
      .findOneByOrFail({ id: published.id });
    expect(reloaded.status).toBe(VideoStatus.Removed);
  });

  it('cùng 1 người report lặp lại 1 video → không tính thêm distinct reporter (unique DB)', async () => {
    const author = await createUser('video-author-report-dup');
    const reporter = await createUser('video-reporter-dup');
    const published = await uploadAndPublish(author.id);

    await video.reportVideo(auth(reporter.id), published.id, ReportReason.Spam);
    await video.reportVideo(auth(reporter.id), published.id, ReportReason.Spam);

    const count = await ds
      .getRepository(Report)
      .countBy({ targetVideoId: published.id, reporterUserId: reporter.id });
    expect(count).toBe(1);
  });

  it('sweeper chuyển video kẹt uploading quá hạn → failed', async () => {
    const author = await createUser('video-author-sweep');
    const { video: created } = await video.createUploadIntent(
      auth(author.id),
      {},
      'sweep-key-1',
    );
    await ds.query(
      `UPDATE videos SET created_at = now() - interval '2 hours' WHERE id = $1`,
      [created.id],
    );
    const swept = await sweeper.runOnce();
    expect(swept).toBeGreaterThanOrEqual(1);
    const reloaded = await ds
      .getRepository(Video)
      .findOneByOrFail({ id: created.id });
    expect(reloaded.status).toBe(VideoStatus.Failed);
  });

  it('ranking job tính rankScore cho video published, fallback recent khi NULL', async () => {
    const author = await createUser('video-author-rank');
    const published = await uploadAndPublish(author.id);
    expect(published.rankScore).toBeNull(); // chưa chạy job lần nào

    await ranking.runOnce();
    const reloaded = await ds
      .getRepository(Video)
      .findOneByOrFail({ id: published.id });
    expect(reloaded.rankScore).not.toBeNull();
  });

  it('listPublished: chỉ hiện published, sort=recent mặc định', async () => {
    const author = await createUser('video-author-list');
    const published = await uploadAndPublish(author.id);
    const { video: notYetPublished } = await video.createUploadIntent(
      auth(author.id),
      {},
      'list-key-unpublished',
    );

    const page = await video.listPublished({ limit: 50 });
    const ids = page.items.map((v) => v.id);
    expect(ids).toContain(published.id);
    expect(ids).not.toContain(notYetPublished.id);
  });

  describe('ranking: xoay vòng theo rank_computed_at, index cho sort=ranked', () => {
    const withConfig = async (
      over: Record<string, unknown>,
      run: () => Promise<void>,
    ): Promise<void> => {
      const previous = Object.fromEntries(
        Object.keys(over).map((key) => [key, CONFIG[key]]),
      );
      Object.assign(CONFIG, over);
      try {
        await run();
      } finally {
        Object.assign(CONFIG, previous);
      }
    };
    const markAllComputed = (interval: string) =>
      ds.query(
        `UPDATE videos SET rank_computed_at = now() - interval '${interval}' WHERE status = 'published'`,
      );

    it('video mới (NULL) được tính điểm TRƯỚC video đã có điểm, kể cả khi lô chỉ có 1; job không đụng updated_at', async () => {
      const author = await createUser('rank-order-author');
      await markAllComputed('10 days');
      const fresh = await uploadAndPublish(author.id);
      expect(fresh.rankComputedAt).toBeNull();

      await withConfig(
        { VIDEO_RANKING_BATCH_SIZE: 1, VIDEO_RANKING_MAX_BATCHES_PER_TICK: 1 },
        async () => {
          expect(await ranking.runOnce()).toBe(1);
        },
      );

      const reloaded = await ds
        .getRepository(Video)
        .findOneByOrFail({ id: fresh.id });
      expect(reloaded.rankComputedAt).not.toBeNull();
      expect(reloaded.rankScore).not.toBeNull();
      expect(reloaded.updatedAt.getTime()).toBe(fresh.updatedAt.getTime());
    });

    it('video có counter tăng liên tục KHÔNG bị xếp cuối hàng chờ: thứ tự theo lần tính điểm gần nhất, cũ nhất trước', async () => {
      const author = await createUser('rank-stale-author');
      const liker = await createUser('rank-stale-liker');
      const stale = await uploadAndPublish(author.id);
      const recent = await uploadAndPublish(author.id);
      await markAllComputed('1 day');
      await ds.query(
        `UPDATE videos SET rank_computed_at = now() - interval '30 days' WHERE id = $1`,
        [stale.id],
      );
      // like làm updated_at của `stale` mới nhất — trước đây điều này đẩy nó xuống cuối hàng chờ
      await video.like(auth(liker.id), stale.id);

      await withConfig(
        { VIDEO_RANKING_BATCH_SIZE: 1, VIDEO_RANKING_MAX_BATCHES_PER_TICK: 1 },
        async () => {
          await ranking.runOnce();
        },
      );

      const [staleAfter, recentAfter] = await Promise.all([
        ds.getRepository(Video).findOneByOrFail({ id: stale.id }),
        ds.getRepository(Video).findOneByOrFail({ id: recent.id }),
      ]);
      expect(
        (staleAfter.rankComputedAt as Date).getTime() >
          (recentAfter.rankComputedAt as Date).getTime(),
      ).toBe(true); // stale vừa được tính, recent vẫn là mốc cũ (1 ngày trước)
    });

    it('nhiều lô mỗi tick: dừng khi một lô không đầy, trả tổng số video đã tính', async () => {
      const author = await createUser('rank-batches-author');
      await markAllComputed('5 days');
      const created: Video[] = [];
      for (let i = 0; i < 5; i += 1)
        created.push(await uploadAndPublish(author.id));

      let processed = 0;
      await withConfig(
        { VIDEO_RANKING_BATCH_SIZE: 2, VIDEO_RANKING_MAX_BATCHES_PER_TICK: 3 },
        async () => {
          processed = await ranking.runOnce();
        },
      );

      expect(processed).toBe(6); // 2 + 2 + 2 (tối đa 3 lô) — 5 video mới + 1 video cũ nhất
      const [row] = (await ds.query(
        `SELECT count(*)::int AS n FROM videos WHERE id = ANY($1) AND rank_computed_at IS NOT NULL`,
        [created.map((item) => item.id)],
      )) as Array<{ n: number }>;
      expect(row?.n).toBe(5);
    });

    it('catalogue nhỏ hơn lô × số lô: mỗi video chỉ được tính MỘT lần mỗi tick (không ghi lặp), vòng lặp dừng sớm', async () => {
      const author = await createUser('rank-once-author');
      await markAllComputed('3 days');
      for (let i = 0; i < 3; i += 1) await uploadAndPublish(author.id);
      const [{ n }] = (await ds.query(
        `SELECT count(*)::int AS n FROM videos WHERE status = 'published'`,
      )) as Array<{ n: number }>;

      let processed = 0;
      await withConfig(
        {
          VIDEO_RANKING_BATCH_SIZE: 2,
          VIDEO_RANKING_MAX_BATCHES_PER_TICK: 100,
        },
        async () => {
          processed = await ranking.runOnce();
        },
      );

      // Trước khi sửa: lô nào cũng đầy (còn ≥ 2 video) nên chạy đủ 100 lô × 2 = 200 lần ghi.
      expect(processed).toBe(n);
    });

    it('sort=ranked phân trang đúng theo (rank_score DESC, id DESC) — không trùng/không sót — và câu truy vấn dùng idx_videos_ranked', async () => {
      const author = await createUser('rank-page-author');
      const created: Video[] = [];
      for (let i = 0; i < 5; i += 1)
        created.push(await uploadAndPublish(author.id));
      await ranking.runOnce();

      const seen: Video[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < 50; page += 1) {
        const result = await video.listPublished({
          limit: 2,
          sort: 'ranked',
          cursor,
        });
        seen.push(...result.items);
        cursor = result.meta.nextCursor ?? undefined;
        if (cursor === undefined) break;
      }
      const ids = seen.map((item) => item.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const item of created) expect(ids).toContain(item.id);
      const scores = seen.map((item) => item.rankScore as number);
      expect([...scores].sort((a, b) => b - a)).toEqual(scores);

      const queryRunner = ds.createQueryRunner();
      await queryRunner.connect();
      try {
        await queryRunner.query('SET enable_seqscan = off');
        const plan = (await queryRunner.query(
          `EXPLAIN SELECT v.id FROM videos v WHERE v.status = 'published' AND v.rank_score IS NOT NULL
             ORDER BY v.rank_score DESC, v.id DESC LIMIT 21`,
        )) as Array<{ 'QUERY PLAN': string }>;
        expect(plan.map((row) => row['QUERY PLAN']).join('\n')).toContain(
          'idx_videos_ranked',
        );
      } finally {
        await queryRunner.release();
      }
    });
  });

  describe('hàng chờ duyệt và xoá comment (sửa lỗi phân trang / trừ đếm hai lần)', () => {
    it('listPendingReview phân trang ASC đi tiếp bằng cursor `>`: đủ hàng, không lặp trang 1', async () => {
      const author = await createUser('pending-page-author');
      const mine: string[] = [];
      for (let i = 0; i < 5; i += 1) {
        const { video: created } = await video.createUploadIntent(
          auth(author.id),
          {},
          `pending-page-${author.id}-${i}`,
        );
        await video.finalizeUpload(auth(author.id), created.id);
        mine.push(created.id);
      }

      const seen: Video[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < 50; page += 1) {
        const result = await video.listPendingReview({ limit: 2, cursor });
        seen.push(...result.items);
        cursor = result.meta.nextCursor ?? undefined;
        if (cursor === undefined) break;
      }

      const ids = seen.map((item) => item.id);
      expect(new Set(ids).size).toBe(ids.length); // trước đây trang 2 lặp trang 1
      for (const id of mine) expect(ids).toContain(id);
      const times = seen.map((item) => item.createdAt.getTime());
      expect([...times].sort((a, b) => a - b)).toEqual(times); // cũ nhất trước
    });

    it('xoá comment bấm đúp/đồng thời chỉ trừ commentCount MỘT lần (không âm)', async () => {
      const author = await createUser('del-comment-author');
      const published = await uploadAndPublish(author.id);
      const comment = await video.createComment(
        auth(author.id),
        published.id,
        'xoá hai lần',
      );

      const results = await Promise.allSettled([
        video.deleteComment(auth(author.id), published.id, comment.id),
        video.deleteComment(auth(author.id), published.id, comment.id),
      ]);

      expect(results.some((result) => result.status === 'fulfilled')).toBe(
        true,
      );
      const reloaded = await ds
        .getRepository(Video)
        .findOneByOrFail({ id: published.id });
      expect(reloaded.commentCount).toBe(0);
    });
  });

  describe('counter đệm trên Redis (VIDEO_COUNTER_BUFFER_ENABLED)', () => {
    const REDIS_URL = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
    let redis: Redis;
    let buffer: RedisVideoCounterBufferAdapter;
    let buffered: ShortVideoService;
    let flush: VideoCounterFlushService;

    const counts = async (id: string) => {
      const row = await ds.getRepository(Video).findOneByOrFail({ id });
      return {
        views: row.viewCount,
        likes: row.likeCount,
        comments: row.commentCount,
      };
    };

    beforeAll(() => {
      redis = new Redis(REDIS_URL, { maxRetriesPerRequest: 1 });
    });

    afterAll(async () => {
      await redis.quit();
    });

    beforeEach(() => {
      // Tiền tố riêng mỗi test: không ăn nhầm delta của test khác trên cùng Redis
      buffer = new RedisVideoCounterBufferAdapter(
        redis,
        `video:counter:test:${Math.random().toString(36).slice(2)}:`,
      );
      buffered = makeVideoService(buffer);
      flush = new VideoCounterFlushService(
        ds,
        configStub,
        schedulerStub,
        buffer,
      );
    });

    it('like/comment/view qualified KHÔNG ghi videos ngay; flush gom thành một lần cập nhật đúng số lượng', async () => {
      const author = await createUser('buf-author');
      const published = await uploadAndPublish(author.id);
      const users = await Promise.all(
        Array.from({ length: 5 }, (_, i) => createUser(`buf-liker-${i}`)),
      );

      for (const user of users) {
        await buffered.like(auth(user.id), published.id);
      }
      await buffered.createComment(
        auth((users[0] as User).id),
        published.id,
        'hay',
      );
      await buffered.recordView(
        auth((users[1] as User).id),
        published.id,
        5_000,
      );

      expect(await counts(published.id)).toEqual({
        views: 0,
        likes: 0,
        comments: 0,
      });
      expect(await flush.runOnce()).toBe(1); // một video, dù có 7 lượt
      expect(await counts(published.id)).toEqual({
        views: 1,
        likes: 5,
        comments: 1,
      });
      expect(await flush.runOnce()).toBe(0); // đã drain hết
    });

    it('unlike và xoá comment trừ qua bộ đệm; counter không âm; like replay (unique) không đệm lần hai', async () => {
      const author = await createUser('buf-dec-author');
      const liker = await createUser('buf-dec-liker');
      const published = await uploadAndPublish(author.id);

      await buffered.like(auth(liker.id), published.id);
      await buffered.like(auth(liker.id), published.id); // replay: unique chặn, KHÔNG đệm thêm
      const comment = await buffered.createComment(
        auth(liker.id),
        published.id,
        'x',
      );
      await flush.runOnce();
      expect(await counts(published.id)).toEqual({
        views: 0,
        likes: 1,
        comments: 1,
      });

      await buffered.unlike(auth(liker.id), published.id);
      await buffered.deleteComment(auth(liker.id), published.id, comment.id);
      await flush.runOnce();
      expect(await counts(published.id)).toEqual({
        views: 0,
        likes: 0,
        comments: 0,
      });

      // unlike khi chưa like → không đệm, không âm
      await buffered.unlike(auth(liker.id), published.id);
      await flush.runOnce();
      expect((await counts(published.id)).likes).toBe(0);
    });

    it('Redis lỗi khi đệm → fail-open: cộng thẳng vào DB ngay (hành vi cũ)', async () => {
      const author = await createUser('buf-open-author');
      const liker = await createUser('buf-open-liker');
      const published = await uploadAndPublish(author.id);
      const broken = {
        enabled: true,
        add: () => Promise.reject(new Error('redis down')),
        drain: async () => [],
        restore: async () => undefined,
      } as unknown as VideoCounterBufferPort;
      const failOpen = makeVideoService(broken);

      await failOpen.like(auth(liker.id), published.id);

      expect((await counts(published.id)).likes).toBe(1);
    });

    it('flush DB lỗi → delta được cộng lại, tick sau áp đủ (không mất, không áp đôi)', async () => {
      const author = await createUser('buf-retry-author');
      const liker = await createUser('buf-retry-liker');
      const published = await uploadAndPublish(author.id);
      await buffered.like(auth(liker.id), published.id);
      const flaky = {
        query: jest
          .fn()
          .mockRejectedValueOnce(new Error('db down'))
          .mockImplementation((sql: string, params: unknown[]) =>
            ds.query(sql, params),
          ),
      };
      const flakyFlush = new VideoCounterFlushService(
        flaky as never,
        configStub,
        schedulerStub,
        buffer,
      );

      await expect(flakyFlush.runOnce()).rejects.toThrow('db down');
      expect((await counts(published.id)).likes).toBe(0);

      expect(await flakyFlush.runOnce()).toBe(1);
      expect((await counts(published.id)).likes).toBe(1);
      expect(await flakyFlush.runOnce()).toBe(0);
    });

    it('nhiều video trong một lô chỉ tốn MỘT câu UPDATE; lô vượt VIDEO_COUNTER_FLUSH_BATCH chia nhiều lượt drain', async () => {
      const author = await createUser('buf-batch-author');
      const liker = await createUser('buf-batch-liker');
      const videos = [
        await uploadAndPublish(author.id),
        await uploadAndPublish(author.id),
        await uploadAndPublish(author.id),
      ];
      for (const item of videos) await buffered.like(auth(liker.id), item.id);
      const spy = jest.spyOn(ds, 'query');

      expect(await flush.runOnce()).toBe(3);
      expect(
        spy.mock.calls.filter(([sql]) => String(sql).includes('UPDATE videos')),
      ).toHaveLength(1);
      spy.mockRestore();

      for (const item of videos) await buffered.unlike(auth(liker.id), item.id);
      const previous = CONFIG['VIDEO_COUNTER_FLUSH_BATCH'];
      CONFIG['VIDEO_COUNTER_FLUSH_BATCH'] = 2; // 3 video → lượt drain 2 + 1
      const batchedSpy = jest.spyOn(ds, 'query');
      try {
        expect(await flush.runOnce()).toBe(3);
        expect(
          batchedSpy.mock.calls.filter(([sql]) =>
            String(sql).includes('UPDATE videos'),
          ),
        ).toHaveLength(2);
      } finally {
        CONFIG['VIDEO_COUNTER_FLUSH_BATCH'] = previous;
        batchedSpy.mockRestore();
      }
      for (const item of videos) {
        expect((await counts(item.id)).likes).toBe(0);
      }
    });

    it('adapter: drain trả đủ delta nhiều video và xoá chúng; restore cộng lại', async () => {
      await buffer.add('00000000-0000-4000-8000-000000000001', 'like', 3);
      await buffer.add('00000000-0000-4000-8000-000000000001', 'comment', -1);
      await buffer.add('00000000-0000-4000-8000-000000000002', 'view', 2);

      const drained = await buffer.drain(10);

      expect(
        [...drained].sort((a, b) => a.videoId.localeCompare(b.videoId)),
      ).toEqual([
        {
          videoId: '00000000-0000-4000-8000-000000000001',
          views: 0,
          likes: 3,
          comments: -1,
        },
        {
          videoId: '00000000-0000-4000-8000-000000000002',
          views: 2,
          likes: 0,
          comments: 0,
        },
      ]);
      expect(await buffer.drain(10)).toEqual([]);
      await buffer.restore(drained);
      expect((await buffer.drain(10)).length).toBe(2);
    });
  });
});
