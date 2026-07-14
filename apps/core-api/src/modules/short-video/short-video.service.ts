import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { buildCursorPage, decodeCursor } from '@litmatch/common-dtos';
import { DomainException } from '@litmatch/common-exceptions';
import { DataSource, Repository } from 'typeorm';

import { isUniqueViolation } from '../../database/postgres-errors';
import { videoUploadIdempotencyKey } from './short-video.constants';
import { ShortVideoErrors } from './short-video.errors';
import { Video, VideoStatus } from './entities/video.entity';
import { VideoView } from './entities/video-view.entity';
import { VideoComment } from './entities/video-comment.entity';
import { VideoReaction } from './entities/video-reaction.entity';
import { VideoStoragePort } from './ports/video-storage.port';
import { VideoTranscodePort } from './ports/video-transcode.port';
import { ReportReason, SafetyService } from '../safety';

import type { EntityManager } from 'typeorm';
import type { CursorPage, CursorPageQueryDto } from '@litmatch/common-dtos';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import type { CoreApiEnv } from '../../config/env.validation';
import type {
  CreateUploadIntentDto,
  ListVideosQueryDto,
} from './dto/short-video.dtos';

/**
 * Facade short-video (docs/services/short-video-service.md) — V1 hướng Momo. State machine
 * `Video.status` thi hành bằng conditional UPDATE (`WHERE status = 'từ'`, thua race = no-op),
 * KHÔNG SELECT FOR UPDATE (video không tranh chấp gay gắt như matching ticket). Body video
 * không bao giờ chạm NestJS — chỉ có endpoint issue presigned URL + finalize (metadata).
 */
@Injectable()
export class ShortVideoService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Video) private readonly videoRepo: Repository<Video>,
    @InjectRepository(VideoView)
    private readonly viewRepo: Repository<VideoView>,
    @InjectRepository(VideoComment)
    private readonly commentRepo: Repository<VideoComment>,
    @InjectRepository(VideoReaction)
    private readonly reactionRepo: Repository<VideoReaction>,
    private readonly storagePort: VideoStoragePort,
    private readonly transcodePort: VideoTranscodePort,
    private readonly safetyService: SafetyService,
    private readonly config: ConfigService<CoreApiEnv, true>,
  ) {}

  /**
   * Idempotent theo Idempotency-Key (docs/05 § 5.10) — replay không issue upload URL mới,
   * đọc lại video cũ. `storageKey` do storage port sinh TRƯỚC insert; nếu insert dính unique
   * violation (race/replay), upload URL vừa issue bị bỏ phí (chấp nhận được, không có chi phí).
   */
  async createUploadIntent(
    user: AuthenticatedUser,
    dto: CreateUploadIntentDto,
    idempotencyKey: string,
  ): Promise<{ video: Video; uploadUrl: string }> {
    const captionMaxLength = this.config.getOrThrow(
      'VIDEO_CAPTION_MAX_LENGTH',
      { infer: true },
    );
    if (dto.caption && dto.caption.length > captionMaxLength) {
      throw new DomainException(
        ShortVideoErrors.CAPTION_TOO_LONG,
        `Caption dài quá ${captionMaxLength} ký tự`,
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    const key = videoUploadIdempotencyKey(user.userId, idempotencyKey);
    const storageKey = this.storagePort.generateStorageKey(user.userId);

    let video: Video;
    try {
      video = await this.videoRepo.save(
        this.videoRepo.create({
          authorUserId: user.userId,
          status: VideoStatus.Uploading,
          storageKey,
          caption: dto.caption ?? null,
          idempotencyKey: key,
        }),
      );
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      // Replay — storageKey vừa sinh KHÔNG dùng, dùng lại storageKey của video đã tạo gốc để
      // presigned URL trỏ đúng object cũ, không phải object bỏ hoang không ai đọc.
      video = await this.videoRepo.findOneByOrFail({ idempotencyKey: key });
      if (video.caption !== (dto.caption ?? null)) {
        throw new DomainException(
          ShortVideoErrors.VIDEO_UPLOAD_IDEMPOTENCY_CONFLICT,
          'Idempotency-Key đã dùng cho 1 upload khác nội dung',
          HttpStatus.CONFLICT,
        );
      }
    }
    const uploadUrl = await this.storagePort.issueUploadUrl(video.storageKey);
    return { video, uploadUrl };
  }

  /**
   * Client báo đã upload xong → chuyển uploading→processing→(pending_review|published) tuỳ
   * `VIDEO_MODERATION_MODE`. Dev transcode port đồng bộ nên toàn bộ chuỗi chạy trong 1 lần gọi;
   * vendor thật (bất đồng bộ) sẽ tách bước này ra webhook riêng mà không đổi state machine.
   */
  async finalizeUpload(
    user: AuthenticatedUser,
    videoId: string,
  ): Promise<Video> {
    const video = await this.getOwnedOrThrow(user, videoId);
    const toProcessing = await this.transition(
      videoId,
      VideoStatus.Uploading,
      VideoStatus.Processing,
    );
    if (!toProcessing) {
      throw new DomainException(
        ShortVideoErrors.VIDEO_INVALID_TRANSITION,
        `Video đang '${video.status}', chỉ finalize được khi đang 'uploading'`,
        HttpStatus.CONFLICT,
      );
    }

    try {
      const result = await this.transcodePort.transcode(video.storageKey);
      const moderationMode = this.config.getOrThrow('VIDEO_MODERATION_MODE', {
        infer: true,
      });
      const nextStatus =
        moderationMode === 'pre'
          ? VideoStatus.PendingReview
          : VideoStatus.Published;
      await this.videoRepo.update(
        { id: videoId, status: VideoStatus.Processing },
        {
          status: nextStatus,
          playbackUrl: result.playbackUrl,
          thumbnailUrl: result.thumbnailUrl,
          durationSeconds: result.durationSeconds,
        },
      );
    } catch {
      await this.transition(
        videoId,
        VideoStatus.Processing,
        VideoStatus.Failed,
      );
    }
    return this.videoRepo.findOneByOrFail({ id: videoId });
  }

  /** Guard trung tâm — không tồn tại/removed/rejected/chưa published (với người không phải tác giả) trả CÙNG mã lỗi. */
  async getVideoOrThrow(
    user: AuthenticatedUser,
    videoId: string,
  ): Promise<Video> {
    const video = await this.videoRepo.findOneBy({ id: videoId });
    const visible =
      video &&
      (video.authorUserId === user.userId ||
        video.status === VideoStatus.Published);
    if (!visible) {
      throw new DomainException(
        ShortVideoErrors.VIDEO_NOT_FOUND,
        'Không tìm thấy video',
        HttpStatus.NOT_FOUND,
      );
    }
    return video;
  }

  async listPublished(query: ListVideosQueryDto): Promise<CursorPage<Video>> {
    const after = this.decodeVideoCursor(query.cursor);
    const qb = this.videoRepo
      .createQueryBuilder('v')
      .where('v.status = :status', { status: VideoStatus.Published });

    if (query.sort === 'ranked') {
      qb.andWhere('v.rankScore IS NOT NULL');
      if (after) {
        qb.andWhere('(v.rankScore, v.id) < (:cursorScore, :cursorId)', {
          cursorScore: after.value,
          cursorId: after.id,
        });
      }
      qb.orderBy('v.rankScore', 'DESC').addOrderBy('v.id', 'DESC');
    } else {
      if (after) {
        qb.andWhere('(v.createdAt, v.id) < (:cursorCreatedAt, :cursorId)', {
          cursorCreatedAt: after.value,
          cursorId: after.id,
        });
      }
      qb.orderBy('v.createdAt', 'DESC').addOrderBy('v.id', 'DESC');
    }

    const rows = await qb.take(query.limit + 1).getMany();
    return buildCursorPage(rows, query.limit, (last) => ({
      value:
        query.sort === 'ranked'
          ? (last.rankScore as number)
          : last.createdAt.toISOString(),
      id: last.id,
    }));
  }

  /**
   * Self-view không đếm. `qualified` chỉ chuyển 1 LẦN khi watchTimeMs vượt ngưỡng
   * (`VIDEO_QUALIFIED_VIEW_MIN_MS`) — cộng `Video.viewCount` ATOMIC đúng lúc đó, không cộng lại
   * ở các lần cập nhật watchTime sau (idempotent theo cờ `qualified`).
   */
  async recordView(
    user: AuthenticatedUser,
    videoId: string,
    watchTimeMs: number,
  ): Promise<void> {
    const video = await this.getVideoOrThrow(user, videoId);
    if (video.authorUserId === user.userId) return;

    const qualifiedMinMs = this.config.getOrThrow(
      'VIDEO_QUALIFIED_VIEW_MIN_MS',
      { infer: true },
    );
    const nowQualifies = watchTimeMs >= qualifiedMinMs;

    await this.dataSource.transaction(async (manager) => {
      let view = await manager.findOne(VideoView, {
        where: { videoId, viewerId: user.userId },
      });
      if (!view) {
        try {
          view = await manager.save(
            manager.create(VideoView, {
              videoId,
              viewerId: user.userId,
              watchTimeMs,
              qualified: false,
            }),
          );
        } catch (err) {
          if (!isUniqueViolation(err)) throw err;
          view = await manager.findOneByOrFail(VideoView, {
            videoId,
            viewerId: user.userId,
          });
        }
      }
      const shouldQualifyNow = nowQualifies && !view.qualified;
      await manager.update(
        VideoView,
        { id: view.id },
        {
          watchTimeMs: Math.max(view.watchTimeMs, watchTimeMs),
          qualified: view.qualified || nowQualifies,
        },
      );
      if (shouldQualifyNow) {
        await manager.increment(Video, { id: videoId }, 'viewCount', 1);
      }
    });
  }

  /** Idempotent — like khi đã like là no-op (unique DB chặn race). */
  async like(
    user: AuthenticatedUser,
    videoId: string,
  ): Promise<{ liked: boolean; likeCount: number }> {
    const video = await this.getVideoOrThrow(user, videoId);
    try {
      await this.dataSource.transaction(async (manager) => {
        await manager.save(
          manager.create(VideoReaction, { videoId, userId: user.userId }),
        );
        await manager.increment(Video, { id: videoId }, 'likeCount', 1);
      });
      return { liked: true, likeCount: video.likeCount + 1 };
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      return { liked: true, likeCount: video.likeCount };
    }
  }

  async unlike(
    user: AuthenticatedUser,
    videoId: string,
  ): Promise<{ liked: boolean; likeCount: number }> {
    const video = await this.getVideoOrThrow(user, videoId);
    const affected = await this.dataSource.transaction(async (manager) => {
      const { affected } = await manager.delete(VideoReaction, {
        videoId,
        userId: user.userId,
      });
      if (affected) {
        await manager.decrement(Video, { id: videoId }, 'likeCount', 1);
      }
      return affected;
    });
    return {
      liked: false,
      likeCount: affected ? video.likeCount - 1 : video.likeCount,
    };
  }

  async createComment(
    user: AuthenticatedUser,
    videoId: string,
    content: string,
  ): Promise<VideoComment> {
    await this.getVideoOrThrow(user, videoId);
    return this.dataSource.transaction(async (manager) => {
      const comment = await manager.save(
        manager.create(VideoComment, {
          videoId,
          authorUserId: user.userId,
          content,
        }),
      );
      await manager.increment(Video, { id: videoId }, 'commentCount', 1);
      return comment;
    });
  }

  async listComments(
    user: AuthenticatedUser,
    videoId: string,
    query: CursorPageQueryDto,
  ): Promise<CursorPage<VideoComment>> {
    await this.getVideoOrThrow(user, videoId);
    const after = this.decodeSeqCursor(query.cursor);
    const qb = this.commentRepo
      .createQueryBuilder('c')
      .where('c.videoId = :videoId', { videoId })
      .andWhere('c.deletedAt IS NULL');
    if (after) {
      qb.andWhere('c.seq < :cursorSeq', { cursorSeq: after.seq });
    }
    const rows = await qb
      .orderBy('c.seq', 'DESC')
      .take(query.limit + 1)
      .getMany();
    return buildCursorPage(rows, query.limit, (last) => ({ seq: last.seq }));
  }

  /** Chỉ tác giả video HOẶC tác giả comment tự xoá được (mirror Feed comment). */
  async deleteComment(
    user: AuthenticatedUser,
    videoId: string,
    commentId: string,
  ): Promise<void> {
    const video = await this.getVideoOrThrow(user, videoId);
    const comment = await this.commentRepo.findOneBy({
      id: commentId,
      videoId,
    });
    if (!comment || comment.deletedAt) {
      throw new DomainException(
        ShortVideoErrors.VIDEO_NOT_FOUND,
        'Không tìm thấy comment',
        HttpStatus.NOT_FOUND,
      );
    }
    if (
      comment.authorUserId !== user.userId &&
      video.authorUserId !== user.userId
    ) {
      throw new DomainException(
        ShortVideoErrors.VIDEO_FORBIDDEN,
        'Không có quyền xoá comment này',
        HttpStatus.FORBIDDEN,
      );
    }
    await this.dataSource.transaction(async (manager) => {
      await manager.update(
        VideoComment,
        { id: commentId },
        { deletedAt: new Date() },
      );
      await manager.decrement(Video, { id: videoId }, 'commentCount', 1);
    });
  }

  // ---------- dùng bởi Admin/moderation (gọi qua service, không phải HTTP trực tiếp) ----------

  /** `VIDEO_MODERATION_MODE=pre` — video chờ duyệt trước khi public. */
  async listPendingReview(
    query: CursorPageQueryDto,
  ): Promise<CursorPage<Video>> {
    const after = this.decodeVideoCursor(query.cursor);
    const qb = this.videoRepo
      .createQueryBuilder('v')
      .where('v.status = :status', { status: VideoStatus.PendingReview });
    if (after) {
      qb.andWhere('(v.createdAt, v.id) < (:cursorCreatedAt, :cursorId)', {
        cursorCreatedAt: after.value,
        cursorId: after.id,
      });
    }
    const rows = await qb
      .orderBy('v.createdAt', 'ASC')
      .addOrderBy('v.id', 'ASC')
      .take(query.limit + 1)
      .getMany();
    return buildCursorPage(rows, query.limit, (last) => ({
      value: last.createdAt.toISOString(),
      id: last.id,
    }));
  }

  /** Nhận `manager` để AdminModule ghi CÙNG transaction với audit log (atomic — cùng pattern `UserService.banUser`). */
  async adminApprove(videoId: string, manager?: EntityManager): Promise<Video> {
    return this.transitionOrThrow(
      videoId,
      VideoStatus.PendingReview,
      VideoStatus.Published,
      manager,
    );
  }

  async adminReject(videoId: string, manager?: EntityManager): Promise<Video> {
    return this.transitionOrThrow(
      videoId,
      VideoStatus.PendingReview,
      VideoStatus.Rejected,
      manager,
    );
  }

  /** Admin gỡ thủ công 1 video đang published (report chưa vượt ngưỡng auto-hide nhưng admin xét cần gỡ). */
  async adminRemove(videoId: string, manager?: EntityManager): Promise<Video> {
    return this.transitionOrThrow(
      videoId,
      VideoStatus.Published,
      VideoStatus.Removed,
      manager,
    );
  }

  /**
   * Report video (docs/services/short-video-service.md § 5) — validate video tồn tại TRƯỚC khi
   * gọi Safety (Safety trung lập, không biết bảng `videos`). Vượt `VIDEO_REPORT_AUTOHIDE_THRESHOLD`
   * distinct reporter → tự động ẩn (published→removed, idempotent — video đã ẩn/đã gỡ thì no-op).
   */
  async reportVideo(
    user: AuthenticatedUser,
    videoId: string,
    reason: ReportReason,
    description?: string,
  ): Promise<void> {
    await this.getVideoOrThrow(user, videoId);
    const { distinctReporterCount } = await this.safetyService.reportVideo(
      user.userId,
      videoId,
      reason,
      description,
    );
    const threshold = this.config.getOrThrow(
      'VIDEO_REPORT_AUTOHIDE_THRESHOLD',
      { infer: true },
    );
    if (distinctReporterCount >= threshold) {
      await this.autoHideIfPublished(videoId);
    }
  }

  /** Report vượt ngưỡng distinct-reporter → auto-hide. Idempotent — video đã removed thì no-op. */
  async autoHideIfPublished(videoId: string): Promise<boolean> {
    return this.transition(videoId, VideoStatus.Published, VideoStatus.Removed);
  }

  // ---------- nội bộ ----------

  private async getOwnedOrThrow(
    user: AuthenticatedUser,
    videoId: string,
  ): Promise<Video> {
    const video = await this.videoRepo.findOneBy({ id: videoId });
    if (!video) {
      throw new DomainException(
        ShortVideoErrors.VIDEO_NOT_FOUND,
        'Không tìm thấy video',
        HttpStatus.NOT_FOUND,
      );
    }
    if (video.authorUserId !== user.userId) {
      throw new DomainException(
        ShortVideoErrors.VIDEO_FORBIDDEN,
        'Video không thuộc về bạn',
        HttpStatus.FORBIDDEN,
      );
    }
    return video;
  }

  /** Conditional UPDATE — thua race (status không còn khớp `from`) = 0 rows = false, không throw. */
  private async transition(
    videoId: string,
    from: VideoStatus,
    to: VideoStatus,
    manager?: EntityManager,
  ): Promise<boolean> {
    const repo = manager ? manager.getRepository(Video) : this.videoRepo;
    const result = await repo.update(
      { id: videoId, status: from },
      { status: to },
    );
    return (result.affected ?? 0) > 0;
  }

  /** Như `transition` nhưng throw rõ ràng cho hành động admin chủ động (không phải best-effort auto-hide). */
  private async transitionOrThrow(
    videoId: string,
    from: VideoStatus,
    to: VideoStatus,
    manager?: EntityManager,
  ): Promise<Video> {
    const repo = manager ? manager.getRepository(Video) : this.videoRepo;
    const ok = await this.transition(videoId, from, to, manager);
    if (!ok) {
      const video = await repo.findOneBy({ id: videoId });
      throw new DomainException(
        ShortVideoErrors.VIDEO_INVALID_TRANSITION,
        video
          ? `Video đang '${video.status}', không thể chuyển sang '${to}'`
          : 'Không tìm thấy video',
        video ? HttpStatus.CONFLICT : HttpStatus.NOT_FOUND,
      );
    }
    return repo.findOneByOrFail({ id: videoId });
  }

  private decodeVideoCursor(
    cursor: string | undefined,
  ): { value: string | number; id: string } | undefined {
    if (!cursor) return undefined;
    const pos = decodeCursor<{ value?: unknown; id?: unknown }>(cursor);
    if (
      !pos ||
      (typeof pos.value !== 'string' && typeof pos.value !== 'number') ||
      typeof pos.id !== 'string'
    ) {
      throw new DomainException(
        ShortVideoErrors.CURSOR_INVALID,
        'Cursor không hợp lệ',
        HttpStatus.BAD_REQUEST,
      );
    }
    return { value: pos.value, id: pos.id };
  }

  private decodeSeqCursor(
    cursor: string | undefined,
  ): { seq: string } | undefined {
    if (!cursor) return undefined;
    const pos = decodeCursor<{ seq?: unknown }>(cursor);
    if (!pos || typeof pos.seq !== 'string') {
      throw new DomainException(
        ShortVideoErrors.CURSOR_INVALID,
        'Cursor không hợp lệ',
        HttpStatus.BAD_REQUEST,
      );
    }
    return { seq: pos.seq };
  }
}
