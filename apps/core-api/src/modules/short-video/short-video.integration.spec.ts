import { DataSource } from 'typeorm';

import { SnakeNamingStrategy } from '../../database/snake-naming.strategy';
import { InitAuthUser1751900000000 } from '../../database/migrations/1751900000000-init-auth-user';
import { UserRole1753600000000 } from '../../database/migrations/1753600000000-user-role';
import { MatchingCore1752200000000 } from '../../database/migrations/1752200000000-matching-core';
import { MatchingGenderPreference1752300000000 } from '../../database/migrations/1752300000000-matching-gender-preference';
import { Safety1752800000000 } from '../../database/migrations/1752800000000-safety';
import { ReportStatus1753800000000 } from '../../database/migrations/1753800000000-report-status';
import { ReportTargetVideo1754900000000 } from '../../database/migrations/1754900000000-report-target-video';
import { ShortVideo1754800000000 } from '../../database/migrations/1754800000000-short-video';

import { ShortVideoService } from './short-video.service';
import { ShortVideoErrors } from './short-video.errors';
import { VideoSweeperService } from './jobs/video-sweeper.service';
import { VideoRankingService } from './jobs/video-ranking.service';
import { Video, VideoStatus } from './entities/video.entity';
import { VideoView } from './entities/video-view.entity';
import { VideoComment } from './entities/video-comment.entity';
import { VideoReaction } from './entities/video-reaction.entity';
import { DevVideoStorageProvider } from './ports/video-storage.port';
import { DevVideoTranscodeProvider } from './ports/video-transcode.port';
import { SafetyService, ReportReason } from '../safety';
import { Block } from '../safety/entities/block.entity';
import { Report } from '../safety/entities/report.entity';
import { User, UserService } from '../user';

import type { ConfigService } from '@nestjs/config';
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
        UserRole1753600000000,
        MatchingCore1752200000000,
        MatchingGenderPreference1752300000000,
        Safety1752800000000,
        ReportTargetVideo1754900000000,
        ReportStatus1753800000000,
        ShortVideo1754800000000,
      ],
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
    const storagePort = new DevVideoStorageProvider(configStub);
    const transcodePort = new DevVideoTranscodeProvider(configStub);

    video = new ShortVideoService(
      ds,
      ds.getRepository(Video),
      ds.getRepository(VideoView),
      ds.getRepository(VideoComment),
      ds.getRepository(VideoReaction),
      storagePort,
      transcodePort,
      safetyService,
      configStub,
    );
    sweeper = new VideoSweeperService(ds, configStub, schedulerStub);
    ranking = new VideoRankingService(ds, configStub, schedulerStub);
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
});
