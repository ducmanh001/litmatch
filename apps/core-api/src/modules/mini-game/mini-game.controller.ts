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
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  CreateMiniGameSessionDto,
  MiniGameSessionDto,
  SubmitMiniGameMoveDto,
} from './dto/mini-game.dtos';
import { MiniGameService } from './mini-game.service';

import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

@ApiTags('mini-game')
@ApiBearerAuth()
@Controller('mini-game')
export class MiniGameController {
  constructor(private readonly miniGameService: MiniGameService) {}

  @Post('sessions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Tạo ván oẳn tù tì với 1 bạn — idempotent (trả lại ván cũ nếu đang chờ move đúng cặp)',
  })
  @ApiOkResponse({ type: MiniGameSessionDto })
  async createSession(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateMiniGameSessionDto,
  ): Promise<MiniGameSessionDto> {
    const session = await this.miniGameService.createSession(
      user.userId,
      dto.friendUserId,
      dto.gameType,
    );
    return MiniGameSessionDto.from(session, user.userId);
  }

  @Post('sessions/:id/moves')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Nộp move — chỉ nộp được 1 lần, không đổi lại được; resolve khi cả 2 đã nộp',
  })
  @ApiOkResponse({ type: MiniGameSessionDto })
  async submitMove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SubmitMiniGameMoveDto,
  ): Promise<MiniGameSessionDto> {
    const session = await this.miniGameService.submitMove(
      user.userId,
      id,
      dto.move,
    );
    return MiniGameSessionDto.from(session, user.userId);
  }

  @Post('sessions/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Huỷ ván đang chờ move — chỉ 1 trong 2 participant',
  })
  @ApiOkResponse({ type: MiniGameSessionDto })
  async cancelSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<MiniGameSessionDto> {
    const session = await this.miniGameService.cancelSession(user.userId, id);
    return MiniGameSessionDto.from(session, user.userId);
  }

  @Get('sessions/:id')
  @ApiOperation({
    summary:
      'State hiện tại — poll fallback cho realtime; không lộ move đối phương trước khi resolved',
  })
  @ApiOkResponse({ type: MiniGameSessionDto })
  async getSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<MiniGameSessionDto> {
    const session = await this.miniGameService.getSession(user.userId, id);
    return MiniGameSessionDto.from(session, user.userId);
  }
}
