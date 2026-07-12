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
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle, minutes } from '@nestjs/throttler';
import { CursorPageQueryDto } from '@litmatch/common-dtos';

import { PartyRoomService } from './party-room.service';
import {
  ChangePartyRoleDto,
  CreatePartyRoomDto,
  JoinPartyRoomDto,
  PartyRoomDetailDto,
  PartyRoomListDto,
  PartyRoomMemberDto,
} from './dto/party-room.dtos';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

@ApiTags('party-room')
@ApiBearerAuth()
@Controller('party/rooms')
export class PartyRoomController {
  constructor(private readonly partyRoomService: PartyRoomService) {}

  @Post()
  @Throttle({ default: { limit: 5, ttl: minutes(1) } })
  @ApiOperation({
    summary: 'Tạo phòng party (caller là host) + mint LiveKit token publish',
  })
  @ApiOkResponse({ type: JoinPartyRoomDto })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreatePartyRoomDto,
  ): Promise<JoinPartyRoomDto> {
    const { room, membership, token, livekitUrl } =
      await this.partyRoomService.createRoom(user, body.title);
    return JoinPartyRoomDto.from(room, membership, token, livekitUrl);
  }

  @Get()
  @ApiOperation({ summary: 'List phòng đang mở — cursor pagination' })
  @ApiOkResponse({ type: PartyRoomListDto })
  async list(@Query() query: CursorPageQueryDto): Promise<PartyRoomListDto> {
    const { data, meta } = await this.partyRoomService.listRooms(
      query.limit,
      query.cursor,
    );
    return PartyRoomListDto.from(data, meta);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết phòng + member active' })
  @ApiOkResponse({ type: PartyRoomDetailDto })
  async get(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PartyRoomDetailDto> {
    const { room, members } = await this.partyRoomService.getRoom(id);
    return PartyRoomDetailDto.from(room, members);
  }

  @Post(':id/join')
  @HttpCode(HttpStatus.OK)
  // re-join khi đang là member là hợp lệ (rớt mạng) — trả token mới theo role hiện tại
  @Throttle({ default: { limit: 20, ttl: minutes(1) } })
  @ApiOperation({
    summary: 'Join phòng làm audience + mint LiveKit token (canPublish=false)',
  })
  @ApiOkResponse({ type: JoinPartyRoomDto })
  async join(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<JoinPartyRoomDto> {
    const { room, membership, token, livekitUrl } =
      await this.partyRoomService.joinRoom(user, id);
    return JoinPartyRoomDto.from(room, membership, token, livekitUrl);
  }

  @Post(':id/leave')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Rời phòng — idempotent; host rời thì phòng đóng với mọi người (GĐ3 không transfer host)',
  })
  async leave(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ ok: true }> {
    await this.partyRoomService.leaveRoom(user, id);
    return { ok: true };
  }

  @Post(':id/members/:userId/role')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Host cấp/thu quyền speaker — cap speaker enforce dưới lock phòng, grant SFU đổi ngay',
  })
  @ApiOkResponse({ type: PartyRoomMemberDto })
  async changeRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) targetUserId: string,
    @Body() body: ChangePartyRoleDto,
  ): Promise<PartyRoomMemberDto> {
    return PartyRoomMemberDto.from(
      await this.partyRoomService.changeRole(user, id, targetUserId, body.role),
    );
  }
}
