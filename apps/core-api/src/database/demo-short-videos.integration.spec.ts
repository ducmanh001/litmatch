import { DataSource } from 'typeorm';

import { SnakeNamingStrategy } from './snake-naming.strategy';
import { InitAuthUser1751900000000 } from './migrations/1751900000000-init-auth-user';
import { UserRole1753600000000 } from './migrations/1753600000000-user-role';
import { ShortVideo1754800000000 } from './migrations/1754800000000-short-video';
import { UserProfilePreferences1755800000000 } from './migrations/1755800000000-user-profile-preferences';
import {
  DEMO_SHORT_VIDEOS,
  DEMO_VIDEO_AUTHOR_ID,
  DemoShortVideos1756700000000,
} from './migrations/1756700000000-demo-short-videos';
import { User, UserService } from '../modules/user';
import { ShortVideoController } from '../modules/short-video/short-video.controller';
import { ShortVideoService } from '../modules/short-video/short-video.service';
import {
  Video,
  VideoStatus,
} from '../modules/short-video/entities/video.entity';
import { VideoComment } from '../modules/short-video/entities/video-comment.entity';
import { VideoReaction } from '../modules/short-video/entities/video-reaction.entity';
import { VideoView } from '../modules/short-video/entities/video-view.entity';

import type { ConfigService } from '@nestjs/config';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import type { CoreApiEnv } from '../config/env.validation';

const INTEGRATION_DB_URL = process.env['INTEGRATION_DB_URL'];
const d = INTEGRATION_DB_URL ? describe : describe.skip;
if (!INTEGRATION_DB_URL) {
  console.warn(
    '[demo-short-videos.integration] BỎ QUA — set INTEGRATION_DB_URL để chạy Postgres thật',
  );
}

const configStub = {
  getOrThrow: (key: string) => {
    if (key === 'VIDEO_QUALIFIED_VIEW_MIN_MS') return 3000;
    throw new Error(`missing config ${key}`);
  },
} as unknown as ConfigService<CoreApiEnv, true>;

const auth = (userId: string): AuthenticatedUser => ({
  userId,
  isGuest: false,
  role: 'user',
});

jest.setTimeout(60_000);

d('demo short-video seed (Postgres thật)', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    const url = new URL(INTEGRATION_DB_URL as string);
    const databaseName = `${url.pathname.slice(1)}_demo_short_videos`;
    url.pathname = `/${databaseName}`;

    const adminUrl = new URL(INTEGRATION_DB_URL as string);
    adminUrl.pathname = '/postgres';
    const admin = new DataSource({
      type: 'postgres',
      url: adminUrl.toString(),
    });
    await admin.initialize();
    const exists = await admin.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [databaseName],
    );
    if (exists.length === 0)
      await admin.query(`CREATE DATABASE "${databaseName}"`);
    await admin.destroy();

    dataSource = new DataSource({
      type: 'postgres',
      url: url.toString(),
      entities: [User, Video, VideoView, VideoComment, VideoReaction],
      migrations: [
        InitAuthUser1751900000000,
        UserRole1753600000000,
        ShortVideo1754800000000,
        UserProfilePreferences1755800000000,
        DemoShortVideos1756700000000,
      ],
      namingStrategy: new SnakeNamingStrategy(),
      synchronize: false,
      dropSchema: true,
    });
    await dataSource.initialize();
    await dataSource.runMigrations({ transaction: 'each' });
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  it('trả VideoDto bình thường và cho một user khác like/comment/view video seed', async () => {
    const users = dataSource.getRepository(User);
    const videos = dataSource.getRepository(Video);
    const author = await users.findOneByOrFail({ id: DEMO_VIDEO_AUTHOR_ID });
    expect(author).toMatchObject({
      nickname: 'Litmatch Demo',
      avatarId: 'demo-short-video',
      isGuest: false,
    });
    expect(await videos.countBy({ status: VideoStatus.Published })).toBe(3);

    const viewer = await users.save(
      users.create({ nickname: 'video-viewer', avatarId: 'default-01' }),
    );
    const service = new ShortVideoService(
      dataSource,
      videos,
      dataSource.getRepository(VideoView),
      dataSource.getRepository(VideoComment),
      dataSource.getRepository(VideoReaction),
      {} as never,
      {} as never,
      { listFriendIds: async () => [] } as never,
      {} as never,
      configStub,
    );
    const controller = new ShortVideoController(
      service,
      new UserService(users, { getOrThrow: () => 'default-01' } as never),
    );

    const page = await controller.list(auth(viewer.id), { limit: 10 });
    expect(page.items).toHaveLength(3);
    const rankedPage = await controller.list(auth(viewer.id), {
      limit: 10,
      sort: 'ranked',
    });
    expect(rankedPage.items).toHaveLength(3);
    expect(page.items).toEqual(
      expect.arrayContaining(
        DEMO_SHORT_VIDEOS.map((video) =>
          expect.objectContaining({
            id: video.id,
            playbackUrl: video.playbackUrl,
            thumbnailUrl: video.thumbnailUrl,
            durationSeconds: video.durationSeconds,
            author: expect.objectContaining({ id: DEMO_VIDEO_AUTHOR_ID }),
          }),
        ),
      ),
    );

    const seededVideoId = DEMO_SHORT_VIDEOS[0].id;
    await service.recordView(auth(viewer.id), seededVideoId, 3000);
    await service.like(auth(viewer.id), seededVideoId);
    await service.createComment(auth(viewer.id), seededVideoId, 'Hay quá!');
    expect(await videos.findOneByOrFail({ id: seededVideoId })).toMatchObject({
      viewCount: 1,
      likeCount: 1,
      commentCount: 1,
    });
  });

  it('rollback xóa video nhưng giữ author đã có FK tham chiếu', async () => {
    await dataSource.query(`
      CREATE TABLE demo_short_video_author_ref (
        author_id uuid NOT NULL REFERENCES users(id)
      )
    `);
    await dataSource.query(
      `INSERT INTO demo_short_video_author_ref (author_id) VALUES ($1)`,
      [DEMO_VIDEO_AUTHOR_ID],
    );
    await dataSource.undoLastMigration({ transaction: 'each' });

    expect(
      await dataSource
        .getRepository(Video)
        .countBy({ authorUserId: DEMO_VIDEO_AUTHOR_ID }),
    ).toBe(0);
    expect(
      await dataSource
        .getRepository(User)
        .findOneBy({ id: DEMO_VIDEO_AUTHOR_ID }),
    ).not.toBeNull();
    await dataSource.query(`DROP TABLE demo_short_video_author_ref`);
  });
});
