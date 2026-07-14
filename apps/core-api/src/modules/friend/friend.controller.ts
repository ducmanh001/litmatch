import {
  Body,
  Controller,
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

import { FriendService } from './friend.service';
import {
  ConversationDto,
  FriendDto,
  MessageDto,
  MessagesPageDto,
  SendFriendMessageDto,
  StreakDto,
} from './dto/friend.dtos';
import { ApiCursorPageQuery } from '../../common/decorators/cursor-page-query.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  ApiIdempotencyKeyHeader,
  IdempotencyKey,
} from '../../common/decorators/idempotency-key.decorator';
import { PublicProfileDto, UserService } from '../user';

import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

@ApiTags('friends')
@ApiBearerAuth()
@Controller()
export class FriendController {
  constructor(
    private readonly friendService: FriendService,
    private readonly userService: UserService,
  ) {}

  @Get('friends')
  @ApiOperation({
    summary:
      'Danh sách bạn (profile + conversationId), sort theo chat gần nhất',
  })
  @ApiOkResponse({ type: [FriendDto] })
  async listFriends(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<FriendDto[]> {
    const entries = await this.friendService.listFriends(user.userId);
    return Promise.all(
      entries.map(async (entry) =>
        FriendDto.from(
          entry,
          PublicProfileDto.from(
            await this.userService.getByIdOrThrow(entry.partnerId),
          ),
        ),
      ),
    );
  }

  @Get('friends/:friendUserId/conversation')
  @ApiOperation({
    summary:
      'Conversation với 1 bạn cụ thể — nhảy thẳng từ unlock-profile sang chat',
  })
  @ApiOkResponse({ type: ConversationDto })
  async getConversationWithFriend(
    @CurrentUser() user: AuthenticatedUser,
    @Param('friendUserId', ParseUUIDPipe) friendUserId: string,
  ): Promise<ConversationDto> {
    const conversation = await this.friendService.getConversationWithFriend(
      user.userId,
      friendUserId,
    );
    return ConversationDto.from(conversation.id);
  }

  @Get('conversations/:id/messages')
  @ApiOperation({ summary: 'List message (cursor) — chỉ 2 thành viên' })
  @ApiCursorPageQuery()
  @ApiOkResponse({ type: MessagesPageDto })
  async listMessages(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: CursorPageQueryDto,
  ): Promise<MessagesPageDto> {
    const page = await this.friendService.listMessages(
      user.userId,
      id,
      query.limit,
      query.cursor,
    );
    return {
      items: page.items.map((m) => MessageDto.from(m)),
      meta: page.meta,
    };
  }

  @Get('conversations/:id/streak')
  @ApiOperation({
    summary:
      'Streak trò chuyện — derive khi đọc, chưa có streak nào trả current=0',
  })
  @ApiOkResponse({ type: StreakDto })
  async getStreak(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StreakDto> {
    const streak = await this.friendService.getStreak(user.userId, id);
    return streak ? StreakDto.from(streak) : StreakDto.empty();
  }

  @Post('conversations/:id/messages')
  @HttpCode(HttpStatus.CREATED)
  @ApiIdempotencyKeyHeader()
  @ApiOperation({ summary: 'Gửi message — chỉ 2 thành viên của conversation' })
  @ApiCreatedResponse({ type: MessageDto })
  async sendMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendFriendMessageDto,
    @IdempotencyKey() idempotencyKey: string,
  ): Promise<MessageDto> {
    const message = await this.friendService.sendMessage(
      user.userId,
      id,
      dto.content,
      idempotencyKey,
    );
    return MessageDto.from(message);
  }
}
