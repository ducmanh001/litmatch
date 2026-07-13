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
import { Throttle, minutes } from '@nestjs/throttler';
import { CursorPageQueryDto } from '@litmatch/common-dtos';

import { SoulMatchService } from './soul-match.service';
import {
  RateSessionDto,
  RatingResultDto,
  SendSoulMessageDto,
  SoulMessageDto,
  SoulMessagesPageDto,
  SoulSessionViewDto,
} from './dto/soul-match.dtos';
import { ApiCursorPageQuery } from '../../common/decorators/cursor-page-query.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  ApiIdempotencyKeyHeader,
  IdempotencyKey,
} from '../../common/decorators/idempotency-key.decorator';
import { PublicProfileDto } from '../user';

import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

@ApiTags('soul-match')
@ApiBearerAuth()
@Controller('soul-match')
export class SoulMatchController {
  constructor(private readonly soulMatchService: SoulMatchService) {}

  @Get('sessions/:id')
  @ApiOperation({
    summary:
      'Trạng thái phòng chat ẩn danh (poll) — chỉ verdict của mình + cờ matched',
  })
  @ApiOkResponse({ type: SoulSessionViewDto })
  async getSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SoulSessionViewDto> {
    const { room, myVerdict, matched } =
      await this.soulMatchService.getSessionView(user, id);
    return SoulSessionViewDto.from(room, myVerdict, matched);
  }

  @Get('sessions/:id/messages')
  @ApiOperation({
    summary: 'List message ẩn danh (cursor) — khoá khi phòng đã đóng',
  })
  @ApiCursorPageQuery()
  @ApiOkResponse({ type: SoulMessagesPageDto })
  async listMessages(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: CursorPageQueryDto,
  ): Promise<SoulMessagesPageDto> {
    const page = await this.soulMatchService.listMessages(
      user,
      id,
      query.limit,
      query.cursor,
    );
    return {
      items: page.items.map((m) => SoulMessageDto.from(m, user.userId)),
      meta: page.meta,
    };
  }

  @Post('sessions/:id/messages')
  // chat 2-3 phút — rate limit riêng chặt hơn default (docs/05 § 5.8)
  @Throttle({ default: { limit: 60, ttl: minutes(1) } })
  @ApiIdempotencyKeyHeader()
  @ApiOperation({
    summary:
      'Gửi message ẩn danh — chỉ khi phòng đang mở chat (server enforce giờ)',
  })
  @ApiCreatedResponse({ type: SoulMessageDto })
  async sendMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendSoulMessageDto,
    @IdempotencyKey() idempotencyKey: string,
  ): Promise<SoulMessageDto> {
    const message = await this.soulMatchService.sendMessage(
      user,
      id,
      dto,
      idempotencyKey,
    );
    return SoulMessageDto.from(message, user.userId);
  }

  @Post('sessions/:id/rating')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Đánh giá đối phương (rude|boring|like) — immutable; cả 2 like → thành bạn + unlock profile',
  })
  @ApiOkResponse({ type: RatingResultDto })
  async rate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RateSessionDto,
  ): Promise<RatingResultDto> {
    const result = await this.soulMatchService.rate(user, id, dto);
    return RatingResultDto.from(result.verdict, result.matched);
  }

  @Get('sessions/:id/partner')
  @ApiOperation({
    summary:
      'Profile đối phương — 403 khi chưa match (Friendship là nguồn sự thật unlock)',
  })
  @ApiOkResponse({ type: PublicProfileDto })
  async getPartner(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PublicProfileDto> {
    return this.soulMatchService.getPartnerProfile(user, id);
  }
}
