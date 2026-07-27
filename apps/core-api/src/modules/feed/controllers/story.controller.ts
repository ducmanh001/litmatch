import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { StoryService } from '../services/story.service';
import {
  CreateStoryDto,
  ReplyToStoryDto,
  StoryDto,
  StoryViewersDto,
} from '../dto/story.dtos';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import {
  ApiIdempotencyKeyHeader,
  IdempotencyKey,
} from '../../../common/decorators/idempotency-key.decorator';
import { MessageDto } from '../../friend';

import type { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';

@ApiTags('stories')
@ApiBearerAuth()
@Controller('stories')
export class StoryController {
  constructor(private readonly storyService: StoryService) {}

  @Post()
  @ApiIdempotencyKeyHeader()
  @ApiOperation({
    summary: 'Đăng story — hết hạn sau STORY_TTL_HOURS, guest bị chặn',
  })
  @ApiCreatedResponse({ type: StoryDto })
  async createStory(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateStoryDto,
    @IdempotencyKey() idempotencyKey: string,
  ): Promise<StoryDto> {
    return StoryDto.from(
      await this.storyService.createStory(user, dto, idempotencyKey),
    );
  }

  @Get('ring')
  @ApiOperation({
    summary:
      'Story còn hạn của mình + bạn bè (Ring stories: chỉ bạn bè + mình)',
  })
  @ApiOkResponse({ type: StoryDto, isArray: true })
  async getRing(@CurrentUser() user: AuthenticatedUser): Promise<StoryDto[]> {
    const stories = await this.storyService.getRing(user);
    return stories.map((s) => StoryDto.from(s));
  }

  @Get(':storyId')
  @ApiOperation({
    summary:
      'Xem 1 story — ghi seen-state (trừ tự xem mình), 404 nếu hết hạn/bị block/audience không cho phép',
  })
  @ApiOkResponse({ type: StoryDto })
  async viewStory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('storyId', ParseUUIDPipe) storyId: string,
  ): Promise<StoryDto> {
    return StoryDto.from(await this.storyService.viewStory(user, storyId));
  }

  @Get(':storyId/viewers')
  @ApiOperation({
    summary: 'Danh sách người đã xem — chỉ tác giả, lọc block hiện tại lúc đọc',
  })
  @ApiOkResponse({ type: StoryViewersDto })
  async listViewers(
    @CurrentUser() user: AuthenticatedUser,
    @Param('storyId', ParseUUIDPipe) storyId: string,
  ): Promise<StoryViewersDto> {
    const viewerIds = await this.storyService.listViewers(user, storyId);
    return { viewerIds };
  }

  @Post(':storyId/reply')
  @HttpCode(HttpStatus.CREATED)
  @ApiIdempotencyKeyHeader()
  @ApiOperation({
    summary:
      'Trả lời story → gửi DM cho tác giả (chỉ bạn bè), snapshot mediaUrl vào attachment',
  })
  @ApiCreatedResponse({ type: MessageDto })
  async replyToStory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('storyId', ParseUUIDPipe) storyId: string,
    @Body() dto: ReplyToStoryDto,
    @IdempotencyKey() idempotencyKey: string,
  ): Promise<MessageDto> {
    const message = await this.storyService.replyToStory(
      user,
      storyId,
      dto.content,
      idempotencyKey,
    );
    return MessageDto.from(message);
  }
}
