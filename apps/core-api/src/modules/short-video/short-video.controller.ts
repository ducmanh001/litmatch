import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CursorPageQueryDto } from '@litmatch/common-dtos';

import { ShortVideoService } from './short-video.service';
import {
  CreateUploadIntentDto,
  CreateVideoCommentDto,
  ListVideosQueryDto,
  ReactionStatusDto,
  RecordViewDto,
  ReportVideoDto,
  UploadIntentDto,
  VideoCommentDto,
  VideoCommentsPageDto,
  VideoDto,
  VideosPageDto,
} from './dto/short-video.dtos';
import { ApiCursorPageQuery } from '../../common/decorators/cursor-page-query.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  ApiIdempotencyKeyHeader,
  IdempotencyKey,
} from '../../common/decorators/idempotency-key.decorator';
import { PublicProfileDto, UserService } from '../user';

import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

@ApiTags('short-video')
@ApiBearerAuth()
@Controller('videos')
export class ShortVideoController {
  constructor(
    private readonly videoService: ShortVideoService,
    private readonly userService: UserService,
  ) {}

  @Post('upload-intent')
  @ApiIdempotencyKeyHeader()
  @ApiOperation({
    summary:
      'Xin URL upload presigned — body video KHÔNG gửi qua endpoint này, upload thẳng lên storage',
  })
  @ApiCreatedResponse({ type: UploadIntentDto })
  async createUploadIntent(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateUploadIntentDto,
    @IdempotencyKey() idempotencyKey: string,
  ): Promise<UploadIntentDto> {
    const { video, uploadUrl } = await this.videoService.createUploadIntent(
      user,
      dto,
      idempotencyKey,
    );
    return UploadIntentDto.from(video, uploadUrl);
  }

  @Post(':id/finalize')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Báo đã upload xong — chuyển sang processing rồi transcode',
  })
  @ApiOkResponse({ type: VideoDto })
  async finalizeUpload(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<VideoDto> {
    const video = await this.videoService.finalizeUpload(user, id);
    return VideoDto.from(video, await this.getAuthor(video.authorUserId));
  }

  @Get()
  @ApiOperation({
    summary:
      'Danh sách video published — sort=recent (default) | ranked; feed=following chỉ video của bạn bè',
  })
  @ApiCursorPageQuery()
  @ApiOkResponse({ type: VideosPageDto })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListVideosQueryDto,
  ): Promise<VideosPageDto> {
    const page = await this.videoService.listPublished(query, user);
    return VideosPageDto.from(page, await this.getAuthors(page.items));
  }

  @Get(':id')
  @ApiOperation({
    summary:
      'Chi tiết 1 video — tác giả xem được mọi status, người khác chỉ published',
  })
  @ApiOkResponse({ type: VideoDto })
  async getVideo(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<VideoDto> {
    const video = await this.videoService.getVideoOrThrow(user, id);
    return VideoDto.from(video, await this.getAuthor(video.authorUserId));
  }

  @Post(':id/report')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      'Report video — vượt ngưỡng distinct reporter thì tự động ẩn (không đụng trust score cá nhân)',
  })
  async reportVideo(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReportVideoDto,
  ): Promise<void> {
    await this.videoService.reportVideo(user, id, dto.reason, dto.description);
  }

  @Post(':id/views')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Ghi nhận watch-time — self-view không đếm' })
  async recordView(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordViewDto,
  ): Promise<void> {
    await this.videoService.recordView(user, id, dto.watchTimeMs);
  }

  @Post(':id/reactions')
  @ApiOperation({ summary: 'Thả tim video' })
  @ApiCreatedResponse({ type: ReactionStatusDto })
  async like(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ReactionStatusDto> {
    return this.videoService.like(user, id);
  }

  @Delete(':id/reactions')
  @ApiOperation({ summary: 'Bỏ tim video' })
  @ApiOkResponse({ type: ReactionStatusDto })
  async unlike(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ReactionStatusDto> {
    return this.videoService.unlike(user, id);
  }

  @Post(':id/comments')
  @ApiOperation({ summary: 'Bình luận video' })
  @ApiCreatedResponse({ type: VideoCommentDto })
  async createComment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateVideoCommentDto,
  ): Promise<VideoCommentDto> {
    const comment = await this.videoService.createComment(
      user,
      id,
      dto.content,
    );
    return VideoCommentDto.from(
      comment,
      await this.getAuthor(comment.authorUserId),
    );
  }

  @Get(':id/comments')
  @ApiOperation({ summary: 'Danh sách bình luận video' })
  @ApiCursorPageQuery()
  @ApiOkResponse({ type: VideoCommentsPageDto })
  async listComments(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: CursorPageQueryDto,
  ): Promise<VideoCommentsPageDto> {
    const page = await this.videoService.listComments(user, id, query);
    return VideoCommentsPageDto.from(page, await this.getAuthors(page.items));
  }

  @Delete(':id/comments/:commentId')
  @ApiOperation({
    summary: 'Xoá bình luận — tác giả comment hoặc tác giả video',
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteComment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('commentId', ParseUUIDPipe) commentId: string,
  ): Promise<void> {
    await this.videoService.deleteComment(user, id, commentId);
  }

  private async getAuthor(userId: string): Promise<PublicProfileDto> {
    return PublicProfileDto.from(await this.userService.getByIdOrThrow(userId));
  }

  /** Batch load dùng chung cho một page để không sinh N request author ở client/server. */
  private async getAuthors(
    items: ReadonlyArray<{ authorUserId: string }>,
  ): Promise<Map<string, PublicProfileDto>> {
    const users = await this.userService.findByIds(
      items.map((item) => item.authorUserId),
    );
    return new Map(
      users.map((author) => [author.id, PublicProfileDto.from(author)]),
    );
  }
}
