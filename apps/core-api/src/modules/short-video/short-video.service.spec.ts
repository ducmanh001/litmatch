import { ShortVideoService } from './short-video.service';
import { ShortVideoErrors } from './short-video.errors';
import { Video, VideoStatus } from './entities/video.entity';
import { VideoView } from './entities/video-view.entity';
import { VideoComment } from './entities/video-comment.entity';
import { VideoReaction } from './entities/video-reaction.entity';
import { ReportReason } from '../safety';

import type { ConfigService } from '@nestjs/config';
import type { DataSource, EntityManager, Repository } from 'typeorm';
import type { CoreApiEnv } from '../../config/env.validation';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import type { VideoStoragePort } from './ports/video-storage.port';
import type { VideoTranscodePort } from './ports/video-transcode.port';
import type { SafetyService } from '../safety';

const CONFIG: Record<string, unknown> = {
  VIDEO_CAPTION_MAX_LENGTH: 500,
  VIDEO_MODERATION_MODE: 'pre',
  VIDEO_QUALIFIED_VIEW_MIN_MS: 3000,
  VIDEO_REPORT_AUTOHIDE_THRESHOLD: 5,
};
const configStub = {
  getOrThrow: (key: string) => {
    if (!(key in CONFIG)) throw new Error(`missing config ${key}`);
    return CONFIG[key];
  },
} as unknown as ConfigService<CoreApiEnv, true>;

const author: AuthenticatedUser = {
  userId: 'user-author',
  isGuest: false,
  role: 'user',
};
const viewer: AuthenticatedUser = {
  userId: 'user-viewer',
  isGuest: false,
  role: 'user',
};

function makeVideo(overrides: Partial<Video> = {}): Video {
  return Object.assign(new Video(), {
    id: 'video-1',
    authorUserId: author.userId,
    status: VideoStatus.Published,
    storageKey: 'dev-video/key-1',
    playbackUrl: 'https://dev-storage.invalid/playback/key-1',
    thumbnailUrl: 'https://dev-storage.invalid/thumbnail/key-1',
    caption: 'hello',
    durationSeconds: 15,
    viewCount: 0,
    likeCount: 0,
    commentCount: 0,
    rankScore: null,
    idempotencyKey: 'short-video:upload:user-author:k1',
    createdAt: new Date('2026-07-14T00:00:00Z'),
    updatedAt: new Date('2026-07-14T00:00:00Z'),
    ...overrides,
  });
}

describe('ShortVideoService (unit — mock repo/ports/dataSource)', () => {
  let videoRepo: jest.Mocked<
    Pick<
      Repository<Video>,
      | 'save'
      | 'create'
      | 'findOneBy'
      | 'findOneByOrFail'
      | 'update'
      | 'createQueryBuilder'
    >
  >;
  let viewRepo: jest.Mocked<Pick<Repository<VideoView>, 'save' | 'create'>>;
  let commentRepo: jest.Mocked<
    Pick<
      Repository<VideoComment>,
      'save' | 'create' | 'findOneBy' | 'createQueryBuilder'
    >
  >;
  let reactionRepo: jest.Mocked<
    Pick<Repository<VideoReaction>, 'save' | 'create'>
  >;
  let storagePort: jest.Mocked<VideoStoragePort>;
  let transcodePort: jest.Mocked<VideoTranscodePort>;
  let safetyService: { reportVideo: jest.Mock };
  let manager: {
    findOne: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
    increment: jest.Mock;
    decrement: jest.Mock;
    create: jest.Mock;
    findOneByOrFail: jest.Mock;
    getRepository: jest.Mock;
  };
  let dataSource: { transaction: jest.Mock };
  let service: ShortVideoService;

  beforeEach(() => {
    videoRepo = {
      save: jest.fn(async (v) => v as Video),
      create: jest.fn((input) => Object.assign(new Video(), input)),
      findOneBy: jest.fn(),
      findOneByOrFail: jest.fn(),
      update: jest.fn(async () => ({
        affected: 1,
        raw: [],
        generatedMaps: [],
      })),
      createQueryBuilder: jest.fn(),
    } as never;
    viewRepo = {
      save: jest.fn(async (v) => v as VideoView),
      create: jest.fn((input) => Object.assign(new VideoView(), input)),
    } as never;
    commentRepo = {
      save: jest.fn(async (c) => c as VideoComment),
      create: jest.fn((input) => Object.assign(new VideoComment(), input)),
      findOneBy: jest.fn(),
      createQueryBuilder: jest.fn(),
    } as never;
    reactionRepo = {
      save: jest.fn(async (r) => r as VideoReaction),
      create: jest.fn((input) => Object.assign(new VideoReaction(), input)),
    } as never;
    storagePort = {
      generateStorageKey: jest.fn(() => 'dev-video/generated-key'),
      issueUploadUrl: jest.fn(
        async (key: string) => `https://upload.invalid/${key}`,
      ),
      getPlaybackUrl: jest.fn(
        async (key: string) => `https://playback.invalid/${key}`,
      ),
      getThumbnailUrl: jest.fn(
        async (key: string) => `https://thumb.invalid/${key}`,
      ),
    } as never;
    transcodePort = {
      transcode: jest.fn(async () => ({
        playbackUrl: 'https://playback.invalid/x',
        thumbnailUrl: 'https://thumb.invalid/x',
        durationSeconds: 20,
      })),
    } as never;
    safetyService = {
      reportVideo: jest.fn(async () => ({
        report: {},
        distinctReporterCount: 1,
      })),
    };
    manager = {
      findOne: jest.fn(),
      save: jest.fn(async (t) => t),
      update: jest.fn(async () => ({ affected: 1 })),
      increment: jest.fn(async () => ({
        affected: 1,
        raw: [],
        generatedMaps: [],
      })),
      decrement: jest.fn(async () => ({
        affected: 1,
        raw: [],
        generatedMaps: [],
      })),
      create: jest.fn((entity, input) =>
        Object.assign(new (entity as new () => object)(), input),
      ),
      findOneByOrFail: jest.fn(),
      getRepository: jest.fn(() => videoRepo),
    };
    dataSource = {
      transaction: jest.fn(async (cb: (m: EntityManager) => Promise<unknown>) =>
        cb(manager as unknown as EntityManager),
      ),
    };

    service = new ShortVideoService(
      dataSource as unknown as DataSource,
      videoRepo as unknown as Repository<Video>,
      viewRepo as unknown as Repository<VideoView>,
      commentRepo as unknown as Repository<VideoComment>,
      reactionRepo as unknown as Repository<VideoReaction>,
      storagePort,
      transcodePort,
      safetyService as unknown as SafetyService,
      configStub,
    );
  });

  describe('createUploadIntent', () => {
    it('caption quá dài → CAPTION_TOO_LONG, không gọi storage port', async () => {
      await expect(
        service.createUploadIntent(author, { caption: 'x'.repeat(501) }, 'k1'),
      ).rejects.toMatchObject({ code: ShortVideoErrors.CAPTION_TOO_LONG });
      expect(storagePort.generateStorageKey).not.toHaveBeenCalled();
    });

    it('tạo thành công → video status uploading, gọi issueUploadUrl đúng storageKey vừa sinh', async () => {
      const result = await service.createUploadIntent(
        author,
        { caption: 'hi' },
        'k1',
      );
      expect(result.video.status).toBe(VideoStatus.Uploading);
      expect(storagePort.issueUploadUrl).toHaveBeenCalledWith(
        'dev-video/generated-key',
      );
    });

    it('replay (unique violation) cùng caption → đọc lại video cũ, không tạo đôi', async () => {
      videoRepo.save.mockRejectedValueOnce({ code: '23505' });
      const existing = makeVideo({ status: VideoStatus.Uploading });
      videoRepo.findOneByOrFail.mockResolvedValue(existing);
      const result = await service.createUploadIntent(
        author,
        { caption: 'hello' },
        'k1',
      );
      expect(result.video).toBe(existing);
    });

    it('replay nhưng caption khác → VIDEO_UPLOAD_IDEMPOTENCY_CONFLICT', async () => {
      videoRepo.save.mockRejectedValueOnce({ code: '23505' });
      videoRepo.findOneByOrFail.mockResolvedValue(
        makeVideo({ caption: 'original caption' }),
      );
      await expect(
        service.createUploadIntent(author, { caption: 'different' }, 'k1'),
      ).rejects.toMatchObject({
        code: ShortVideoErrors.VIDEO_UPLOAD_IDEMPOTENCY_CONFLICT,
      });
    });
  });

  describe('finalizeUpload', () => {
    it('không phải tác giả → VIDEO_FORBIDDEN', async () => {
      videoRepo.findOneBy.mockResolvedValue(
        makeVideo({ status: VideoStatus.Uploading }),
      );
      await expect(
        service.finalizeUpload(viewer, 'video-1'),
      ).rejects.toMatchObject({ code: ShortVideoErrors.VIDEO_FORBIDDEN });
    });

    it('không đang uploading → VIDEO_INVALID_TRANSITION', async () => {
      videoRepo.findOneBy.mockResolvedValue(
        makeVideo({ status: VideoStatus.Published }),
      );
      videoRepo.update.mockResolvedValue({
        affected: 0,
        raw: [],
        generatedMaps: [],
      });
      await expect(
        service.finalizeUpload(author, 'video-1'),
      ).rejects.toMatchObject({
        code: ShortVideoErrors.VIDEO_INVALID_TRANSITION,
      });
    });

    it('VIDEO_MODERATION_MODE=pre → transcode xong chuyển pending_review', async () => {
      videoRepo.findOneBy.mockResolvedValue(
        makeVideo({ status: VideoStatus.Uploading }),
      );
      videoRepo.findOneByOrFail.mockResolvedValue(
        makeVideo({ status: VideoStatus.PendingReview }),
      );
      await service.finalizeUpload(author, 'video-1');
      expect(videoRepo.update).toHaveBeenCalledWith(
        { id: 'video-1', status: VideoStatus.Processing },
        expect.objectContaining({ status: VideoStatus.PendingReview }),
      );
    });

    it('transcode lỗi → chuyển failed, không throw ra ngoài', async () => {
      videoRepo.findOneBy.mockResolvedValue(
        makeVideo({ status: VideoStatus.Uploading }),
      );
      transcodePort.transcode.mockRejectedValueOnce(new Error('boom'));
      videoRepo.findOneByOrFail.mockResolvedValue(
        makeVideo({ status: VideoStatus.Failed }),
      );
      const result = await service.finalizeUpload(author, 'video-1');
      expect(result.status).toBe(VideoStatus.Failed);
    });
  });

  describe('getVideoOrThrow', () => {
    it('tác giả xem được video chưa published', async () => {
      videoRepo.findOneBy.mockResolvedValue(
        makeVideo({ status: VideoStatus.PendingReview }),
      );
      const video = await service.getVideoOrThrow(author, 'video-1');
      expect(video.status).toBe(VideoStatus.PendingReview);
    });

    it('người khác không xem được video chưa published → VIDEO_NOT_FOUND (oracle-safe)', async () => {
      videoRepo.findOneBy.mockResolvedValue(
        makeVideo({ status: VideoStatus.PendingReview }),
      );
      await expect(
        service.getVideoOrThrow(viewer, 'video-1'),
      ).rejects.toMatchObject({ code: ShortVideoErrors.VIDEO_NOT_FOUND });
    });

    it('người khác xem được video published', async () => {
      videoRepo.findOneBy.mockResolvedValue(
        makeVideo({ status: VideoStatus.Published }),
      );
      const video = await service.getVideoOrThrow(viewer, 'video-1');
      expect(video.status).toBe(VideoStatus.Published);
    });
  });

  describe('recordView', () => {
    it('self-view không đếm, không chạm transaction', async () => {
      videoRepo.findOneBy.mockResolvedValue(makeVideo());
      await service.recordView(author, 'video-1', 10_000);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('watchTime vượt ngưỡng lần đầu → cộng viewCount đúng 1 lần', async () => {
      videoRepo.findOneBy.mockResolvedValue(makeVideo());
      manager.findOne.mockResolvedValue(null);
      await service.recordView(viewer, 'video-1', 5_000);
      expect(manager.increment).toHaveBeenCalledWith(
        Video,
        { id: 'video-1' },
        'viewCount',
        1,
      );
    });

    it('đã qualified từ trước → không cộng viewCount lần nữa', async () => {
      videoRepo.findOneBy.mockResolvedValue(makeVideo());
      manager.findOne.mockResolvedValue({
        id: 'view-1',
        videoId: 'video-1',
        viewerId: viewer.userId,
        watchTimeMs: 5000,
        qualified: true,
      });
      await service.recordView(viewer, 'video-1', 8_000);
      expect(manager.increment).not.toHaveBeenCalled();
    });
  });

  describe('like/unlike', () => {
    it('like idempotent — đã like rồi thì không cộng đôi likeCount', async () => {
      videoRepo.findOneBy.mockResolvedValue(makeVideo());
      manager.save.mockRejectedValueOnce({ code: '23505' });
      const result = await service.like(viewer, 'video-1');
      expect(result.liked).toBe(true);
    });

    it('unlike khi chưa like → no-op, likeCount giữ nguyên', async () => {
      videoRepo.findOneBy.mockResolvedValue(makeVideo({ likeCount: 3 }));
      manager.getRepository = jest.fn(() => ({
        delete: jest.fn(async () => ({ affected: 0 })),
      }));
      dataSource.transaction = jest.fn(async (cb) =>
        cb({
          delete: jest.fn(async () => ({ affected: 0 })),
          decrement: manager.decrement,
        } as never),
      );
      const result = await service.unlike(viewer, 'video-1');
      expect(result.likeCount).toBe(3);
    });
  });

  describe('reportVideo', () => {
    it('validate video tồn tại trước khi gọi Safety', async () => {
      videoRepo.findOneBy.mockResolvedValue(null);
      await expect(
        service.reportVideo(viewer, 'video-1', ReportReason.Spam),
      ).rejects.toMatchObject({ code: ShortVideoErrors.VIDEO_NOT_FOUND });
      expect(safetyService.reportVideo).not.toHaveBeenCalled();
    });

    it('vượt ngưỡng distinct reporter → tự động ẩn video', async () => {
      videoRepo.findOneBy.mockResolvedValue(makeVideo());
      safetyService.reportVideo.mockResolvedValue({
        report: {},
        distinctReporterCount: 5,
      });
      await service.reportVideo(viewer, 'video-1', ReportReason.Spam);
      expect(videoRepo.update).toHaveBeenCalledWith(
        { id: 'video-1', status: VideoStatus.Published },
        { status: VideoStatus.Removed },
      );
    });

    it('chưa vượt ngưỡng → KHÔNG ẩn video', async () => {
      videoRepo.findOneBy.mockResolvedValue(makeVideo());
      safetyService.reportVideo.mockResolvedValue({
        report: {},
        distinctReporterCount: 2,
      });
      await service.reportVideo(viewer, 'video-1', ReportReason.Spam);
      expect(videoRepo.update).not.toHaveBeenCalled();
    });
  });
});
