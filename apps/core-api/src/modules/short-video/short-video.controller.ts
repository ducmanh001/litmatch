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

import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

@ApiTags('short-video')
@ApiBearerAuth()
@Controller('videos')
export class ShortVideoController {
  constructor(private readonly videoService: ShortVideoService) {}

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
    return VideoDto.from(await this.videoService.finalizeUpload(user, id));
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
    return VideosPageDto.from(
      await this.videoService.listPublished(query, user),
    );
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
    return VideoDto.from(await this.videoService.getVideoOrThrow(user, id));
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
    return VideoCommentDto.from(
      await this.videoService.createComment(user, id, dto.content),
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
    return VideoCommentsPageDto.from(
      await this.videoService.listComments(user, id, query),
    );
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
}
