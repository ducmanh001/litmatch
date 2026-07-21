import {
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
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle, minutes } from '@nestjs/throttler';

import { CallingService } from './calling.service';
import { CallDto, JoinCallDto, VoiceMatchLikeDto } from './dto/calling.dtos';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

@ApiTags('calling')
@ApiBearerAuth()
@Controller('calling')
export class CallingController {
  constructor(private readonly callingService: CallingService) {}

  @Post('match-sessions/:matchSessionId/join')
  @HttpCode(HttpStatus.OK)
  // idempotent tự nhiên theo unique match_session_id — re-join sau rớt mạng là hợp lệ (spec § 2)
  @Throttle({ default: { limit: 20, ttl: minutes(1) } })
  @ApiOperation({
    summary:
      'Tạo/lấy call của voice session đã confirmed + mint LiveKit token (re-join hợp lệ khi chưa ended)',
  })
  @ApiOkResponse({ type: JoinCallDto })
  async join(
    @CurrentUser() user: AuthenticatedUser,
    @Param('matchSessionId', ParseUUIDPipe) matchSessionId: string,
  ): Promise<JoinCallDto> {
    const { call, token, livekitUrl } = await this.callingService.joinCall(
      user,
      matchSessionId,
    );
    return JoinCallDto.from(
      call,
      token,
      livekitUrl,
      this.callingService.getFreeCallSeconds(),
    );
  }

  @Get('calls/:id')
  @ApiOperation({
    summary:
      'Trạng thái call (poll fallback của realtime call.ended) — chỉ member',
  })
  @ApiOkResponse({ type: CallDto })
  async getCall(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CallDto> {
    return CallDto.from(
      await this.callingService.getCall(user, id),
      this.callingService.getFreeCallSeconds(),
    );
  }

  @Post('calls/:id/end')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Chủ động kết thúc call — idempotent, đã ended thì trả trạng thái hiện tại',
  })
  @ApiOkResponse({ type: CallDto })
  async endCall(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CallDto> {
    return CallDto.from(
      await this.callingService.endCall(user, id),
      this.callingService.getFreeCallSeconds(),
    );
  }

  @Post('match-sessions/:matchSessionId/end')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      'Rời Voice Match — đóng call nếu đã tạo và luôn kết thúc session để có thể tìm lượt mới',
  })
  async endMatchSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param('matchSessionId', ParseUUIDPipe) matchSessionId: string,
  ): Promise<void> {
    await this.callingService.endMatchSession(user, matchSessionId);
  }

  @Post('calls/:id/like')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Yêu thích trong/sau Voice Match — cả hai cùng thích thì tạo Friendship và chat vĩnh viễn',
  })
  @ApiOkResponse({ type: VoiceMatchLikeDto })
  async likeCall(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<VoiceMatchLikeDto> {
    return await this.callingService.likeCall(user, id);
  }
}
