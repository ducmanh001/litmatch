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

import { InviteService } from './services/invite.service';
import {
  CreateInviteDto,
  MatchInviteAcceptedDto,
  MatchInviteDto,
  MatchInvitesPageDto,
} from './dto/invite.dtos';
import { ApiCursorPageQuery } from '../../common/decorators/cursor-page-query.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

/**
 * CTA "mời Voice/Soul Match" (W4, docs/services/matching-service.md § Invite) — directed invite,
 * KHÔNG phải friend-request flow. Sống trong module `matching` (ghi thẳng MatchTicket/MatchSession),
 * Discovery/Nearby chỉ là nơi UI lấy ra `inviteeUserId` để gọi endpoint này.
 */
@ApiTags('matching')
@ApiBearerAuth()
@Controller('matching/invites')
export class InviteController {
  constructor(private readonly inviteService: InviteService) {}

  @Post()
  @Throttle({ default: { limit: 10, ttl: minutes(1) } })
  @ApiOperation({
    summary:
      'Mời Voice/Soul Match trực tiếp tới 1 user — 409 nếu đã có lời mời đang chờ tới đúng người này',
  })
  @ApiCreatedResponse({ type: MatchInviteDto })
  async createInvite(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateInviteDto,
  ): Promise<MatchInviteDto> {
    return MatchInviteDto.from(
      await this.inviteService.createInvite(user, dto),
    );
  }

  @Get()
  @ApiOperation({
    summary: 'Danh sách lời mời ĐANG CHỜ phản hồi gửi tới chính mình',
  })
  @ApiCursorPageQuery()
  @ApiOkResponse({ type: MatchInvitesPageDto })
  async listReceived(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: CursorPageQueryDto,
  ): Promise<MatchInvitesPageDto> {
    return MatchInvitesPageDto.from(
      await this.inviteService.listReceivedInvites(user, query),
    );
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Chi tiết 1 lời mời — chỉ inviter/invitee xem được',
  })
  @ApiOkResponse({ type: MatchInviteDto })
  async getInvite(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<MatchInviteDto> {
    return MatchInviteDto.from(await this.inviteService.getInvite(user, id));
  }

  @Post(':id/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Chấp nhận lời mời — tạo trực tiếp ticket/session, gọi confirmTicket(inviteeTicketId) tiếp theo như auto-match',
  })
  @ApiOkResponse({ type: MatchInviteAcceptedDto })
  async accept(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<MatchInviteAcceptedDto> {
    return MatchInviteAcceptedDto.from(
      await this.inviteService.acceptInvite(user, id),
    );
  }

  @Post(':id/decline')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Từ chối lời mời — chỉ invitee' })
  @ApiOkResponse({ type: MatchInviteDto })
  async decline(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<MatchInviteDto> {
    return MatchInviteDto.from(
      await this.inviteService.declineInvite(user, id),
    );
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Huỷ lời mời đã gửi — chỉ inviter, trước khi có phản hồi',
  })
  @ApiOkResponse({ type: MatchInviteDto })
  async cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<MatchInviteDto> {
    return MatchInviteDto.from(await this.inviteService.cancelInvite(user, id));
  }
}
