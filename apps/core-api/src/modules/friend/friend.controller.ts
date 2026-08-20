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
  ConversationMemberStateDto,
  FriendDto,
  MessageDto,
  MessagesPageDto,
  MuteConversationDto,
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
import { ImageAssetPurpose, MediaService } from '../media';

import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

@ApiTags('friends')
@ApiBearerAuth()
@Controller()
export class FriendController {
  constructor(
    private readonly friendService: FriendService,
    private readonly userService: UserService,
    private readonly mediaService: MediaService,
  ) {}

  @Get('friends')
  @ApiOperation({
    summary:
      'Danh sách mọi conversation (profile + conversationId), sort theo chat gần nhất',
  })
  @ApiOkResponse({ type: [FriendDto] })
  async listFriends(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<FriendDto[]> {
    const entries = await this.friendService.listFriends(user.userId);
    const profiles = await this.userService.findByIds(
      entries.map((entry) => entry.partnerId),
    );
    const profileById = new Map(
      profiles.map((profile) => [profile.id, profile]),
    );
    const missingPartnerId = entries.find(
      (entry) => !profileById.has(entry.partnerId),
    )?.partnerId;
    if (missingPartnerId)
      await this.userService.getByIdOrThrow(missingPartnerId);
    return entries.map((entry) => {
      const profile = profileById.get(entry.partnerId);
      if (!profile)
        throw new Error(`Missing friend profile ${entry.partnerId}`);
      return FriendDto.from(entry, PublicProfileDto.from(profile));
    });
  }

  @Get('friends/:friendUserId/conversation')
  @ApiOperation({
    summary:
      'Conversation với 1 profile đã mở chat — nhảy thẳng từ profile sang chat',
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

  @Post('conversations/:id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Đánh dấu đã đọc tới hiện tại — idempotent, chỉ 2 thành viên',
  })
  @ApiOkResponse({ type: ConversationMemberStateDto })
  async markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ConversationMemberStateDto> {
    const state = await this.friendService.markConversationRead(
      user.userId,
      id,
    );
    return ConversationMemberStateDto.from(state);
  }

  @Post('conversations/:id/mute')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Bật/tắt thông báo hội thoại — chỉ tắt kênh notification, message vẫn nhận',
  })
  @ApiOkResponse({ type: ConversationMemberStateDto })
  async setMuted(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MuteConversationDto,
  ): Promise<ConversationMemberStateDto> {
    const state = await this.friendService.setConversationMuted(
      user.userId,
      id,
      dto.muted,
    );
    return ConversationMemberStateDto.from(state);
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
    const imageUrl = dto.imageAssetId
      ? await this.mediaService.resolveImageUrl(
          user.userId,
          dto.imageAssetId,
          ImageAssetPurpose.Message,
        )
      : undefined;
    const message = await this.friendService.sendMessage(
      user.userId,
      id,
      dto.content ?? '',
      idempotencyKey,
      // Kind whitelist tại boundary: HTTP chỉ set được ảnh từ asset đã xác thực; các kind nội bộ khác
      // (vd story_reply) vẫn chỉ đi qua DI giữa module.
      imageUrl !== undefined
        ? { kind: 'image', payload: { url: imageUrl } }
        : null,
    );
    return MessageDto.from(message);
  }
}
