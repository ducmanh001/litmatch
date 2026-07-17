import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post as HttpPost,
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

import { FeedService } from './feed.service';
import {
  CommentDto,
  CommentsPageDto,
  CreateCommentDto,
  CreatePostDto,
  PostDto,
  PostsPageDto,
  ReactionStatusDto,
} from './dto/feed.dtos';
import { ApiCursorPageQuery } from '../../common/decorators/cursor-page-query.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  ApiIdempotencyKeyHeader,
  IdempotencyKey,
} from '../../common/decorators/idempotency-key.decorator';

import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

@ApiTags('feed')
@ApiBearerAuth()
@Controller('feed')
export class FeedController {
  constructor(private readonly feedService: FeedService) {}

  @HttpPost('posts')
  @ApiIdempotencyKeyHeader()
  @ApiOperation({
    summary: 'Đăng bài — guest bị chặn (docs/06), audience mặc định public',
  })
  @ApiCreatedResponse({ type: PostDto })
  async createPost(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePostDto,
    @IdempotencyKey() idempotencyKey: string,
  ): Promise<PostDto> {
    return PostDto.from(
      await this.feedService.createPost(user, dto, idempotencyKey),
    );
  }

  @Get('posts')
  @ApiOperation({
    summary:
      'Feed công khai toàn cục, mới nhất trước — loại tác giả đang block/bị block',
  })
  @ApiCursorPageQuery()
  @ApiOkResponse({ type: PostsPageDto })
  async listFeed(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: CursorPageQueryDto,
  ): Promise<PostsPageDto> {
    return PostsPageDto.from(await this.feedService.listFeed(user, query));
  }

  @Get('users/:userId/posts')
  @ApiOperation({
    summary:
      'Timeline 1 tác giả — audience tự khớp quan hệ (mình/bạn/người lạ), docs/services/feed-service.md § 7',
  })
  @ApiCursorPageQuery()
  @ApiOkResponse({ type: PostsPageDto })
  async listUserTimeline(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query() query: CursorPageQueryDto,
  ): Promise<PostsPageDto> {
    return PostsPageDto.from(
      await this.feedService.listUserTimeline(user, userId, query),
    );
  }

  @Get('posts/:postId')
  @ApiOperation({
    summary: 'Chi tiết 1 bài — 404 nếu đã xoá/bị block (chống oracle)',
  })
  @ApiOkResponse({ type: PostDto })
  async getPost(
    @CurrentUser() user: AuthenticatedUser,
    @Param('postId', ParseUUIDPipe) postId: string,
  ): Promise<PostDto> {
    return PostDto.from(await this.feedService.getPostOrThrow(user, postId));
  }

  @Delete('posts/:postId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Xoá mềm bài viết — chỉ tác giả' })
  async deletePost(
    @CurrentUser() user: AuthenticatedUser,
    @Param('postId', ParseUUIDPipe) postId: string,
  ): Promise<void> {
    await this.feedService.deletePost(user, postId);
  }

  @HttpPost('posts/:postId/comments')
  @ApiOperation({
    summary: 'Bình luận — guest bị chặn, chặn nếu block với tác giả',
  })
  @ApiCreatedResponse({ type: CommentDto })
  async createComment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('postId', ParseUUIDPipe) postId: string,
    @Body() dto: CreateCommentDto,
  ): Promise<CommentDto> {
    return CommentDto.from(
      await this.feedService.createComment(user, postId, dto),
    );
  }

  @Get('posts/:postId/comments')
  @ApiOperation({ summary: 'Danh sách bình luận, cũ → mới' })
  @ApiCursorPageQuery()
  @ApiOkResponse({ type: CommentsPageDto })
  async listComments(
    @CurrentUser() user: AuthenticatedUser,
    @Param('postId', ParseUUIDPipe) postId: string,
    @Query() query: CursorPageQueryDto,
  ): Promise<CommentsPageDto> {
    return CommentsPageDto.from(
      await this.feedService.listComments(user, postId, query),
    );
  }

  @Delete('comments/:commentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Xoá mềm comment — chỉ tác giả' })
  async deleteComment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('commentId', ParseUUIDPipe) commentId: string,
  ): Promise<void> {
    await this.feedService.deleteComment(user, commentId);
  }

  @HttpPost('posts/:postId/reactions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Thả tim — idempotent, guest bị chặn' })
  @ApiOkResponse({ type: ReactionStatusDto })
  async like(
    @CurrentUser() user: AuthenticatedUser,
    @Param('postId', ParseUUIDPipe) postId: string,
  ): Promise<ReactionStatusDto> {
    return this.feedService.like(user, postId);
  }

  @Delete('posts/:postId/reactions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bỏ thả tim — idempotent' })
  @ApiOkResponse({ type: ReactionStatusDto })
  async unlike(
    @CurrentUser() user: AuthenticatedUser,
    @Param('postId', ParseUUIDPipe) postId: string,
  ): Promise<ReactionStatusDto> {
    return this.feedService.unlike(user, postId);
  }

  @Get('posts/:postId/reactions')
  @ApiOperation({ summary: 'Trạng thái thả tim của chính mình + tổng đếm' })
  @ApiOkResponse({ type: ReactionStatusDto })
  async reactionStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('postId', ParseUUIDPipe) postId: string,
  ): Promise<ReactionStatusDto> {
    return this.feedService.reactionStatus(user, postId);
  }
}
