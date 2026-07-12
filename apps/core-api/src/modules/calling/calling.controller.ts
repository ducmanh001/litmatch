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
import { CallDto, JoinCallDto } from './dto/calling.dtos';
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
    return JoinCallDto.from(call, token, livekitUrl);
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
    return CallDto.from(await this.callingService.getCall(user, id));
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
    return CallDto.from(await this.callingService.endCall(user, id));
  }
}
