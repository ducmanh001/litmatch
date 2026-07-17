import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
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

import { ApiCursorPageQuery } from '../../common/decorators/cursor-page-query.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  ApiIdempotencyKeyHeader,
  IdempotencyKey,
} from '../../common/decorators/idempotency-key.decorator';
import {
  CreateMovieSessionDto,
  MovieAnonStateDto,
  MovieMessageDto,
  MovieMessagesPageDto,
  MovieSessionDto,
  RateMovieMatchDto,
  ReactMovieDto,
  SendMovieMessageDto,
  UpdateMovieStateDto,
} from './dto/movie-match.dtos';
import { MovieMatchService } from './movie-match.service';

import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

@ApiTags('movie-match')
@ApiBearerAuth()
@Controller('movie-match')
export class MovieMatchController {
  constructor(private readonly movieMatchService: MovieMatchService) {}

  @Post('sessions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Tạo phiên xem chung với 1 bạn — idempotent (trả lại session cũ nếu đã active đúng cặp)',
  })
  @ApiOkResponse({ type: MovieSessionDto })
  async createSession(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateMovieSessionDto,
  ): Promise<MovieSessionDto> {
    const session = await this.movieMatchService.createSession(
      user.userId,
      dto.friendUserId,
      dto.videoUrl,
    );
    return MovieSessionDto.from(session, user.userId);
  }

  @Patch('sessions/:id/state')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Cập nhật playback state (last-write-wins, không lock) — publish cho bên còn lại',
  })
  @ApiOkResponse({ type: MovieSessionDto })
  async updateState(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMovieStateDto,
  ): Promise<MovieSessionDto> {
    const session = await this.movieMatchService.updateState(
      user.userId,
      id,
      dto.positionSeconds,
      dto.isPlaying,
    );
    return MovieSessionDto.from(session, user.userId);
  }

  @Post('sessions/:id/end')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Kết thúc phiên xem chung — chỉ 1 trong 2 participant',
  })
  @ApiOkResponse({ type: MovieSessionDto })
  async endSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<MovieSessionDto> {
    const session = await this.movieMatchService.endSession(user.userId, id);
    return MovieSessionDto.from(session, user.userId);
  }

  @Get('sessions/:id')
  @ApiOperation({ summary: 'State hiện tại — poll fallback cho realtime' })
  @ApiOkResponse({ type: MovieSessionDto })
  async getSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<MovieSessionDto> {
    const session = await this.movieMatchService.getSession(user.userId, id);
    return MovieSessionDto.from(session, user.userId);
  }

  // ---- flow ghép ẨN DANH (movie-match.html) — state view role-relative, không lộ partner ----

  @Post('anon/queue')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Enqueue idempotent và thử ghép Movie Match ẩn danh',
  })
  @ApiOkResponse({ type: MovieAnonStateDto })
  async joinAnonQueue(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MovieAnonStateDto> {
    return MovieAnonStateDto.from(
      await this.movieMatchService.joinAnonQueue(user.userId),
    );
  }

  @Get('anon/current')
  @ApiOperation({ summary: 'State phục hồi/poll của queue/phiên ẩn danh' })
  @ApiOkResponse({ type: MovieAnonStateDto })
  async getAnonCurrent(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MovieAnonStateDto> {
    return MovieAnonStateDto.from(
      await this.movieMatchService.getAnonCurrent(user.userId),
    );
  }

  @Delete('anon/current')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Huỷ queue/phiên ẩn danh hoặc dismiss kết quả terminal',
  })
  @ApiOkResponse({ type: MovieAnonStateDto })
  async dismissAnonCurrent(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MovieAnonStateDto> {
    return MovieAnonStateDto.from(
      await this.movieMatchService.dismissAnonCurrent(user.userId),
    );
  }

  @Patch('anon/sessions/:id/state')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Playback update phiên ẩn danh — chỉ khi đang xem' })
  @ApiOkResponse({ type: MovieAnonStateDto })
  async updateAnonState(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMovieStateDto,
  ): Promise<MovieAnonStateDto> {
    return MovieAnonStateDto.from(
      await this.movieMatchService.updateAnonState(
        user.userId,
        id,
        dto.positionSeconds,
        dto.isPlaying,
      ),
    );
  }

  @Post('anon/sessions/:id/finish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      '"Kết thúc" phần xem chung — mở phase rating cho cả hai, idempotent',
  })
  @ApiOkResponse({ type: MovieAnonStateDto })
  async endAnonWatch(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<MovieAnonStateDto> {
    return MovieAnonStateDto.from(
      await this.movieMatchService.endAnonWatch(user.userId, id),
    );
  }

  @Post('anon/sessions/:id/rating')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Chốt like/boring/rude một lần; mutual-like mở Friendship',
  })
  @ApiOkResponse({ type: MovieAnonStateDto })
  async rateAnon(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RateMovieMatchDto,
  ): Promise<MovieAnonStateDto> {
    return MovieAnonStateDto.from(
      await this.movieMatchService.rateAnon(user.userId, id, dto.rating),
    );
  }

  @Post('anon/sessions/:id/messages')
  @HttpCode(HttpStatus.CREATED)
  @ApiIdempotencyKeyHeader()
  @ApiOperation({
    summary: 'Chat ẩn danh trong phiên — sender là vai trò tương đối',
  })
  @ApiOkResponse({ type: MovieMessageDto })
  async sendAnonMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendMovieMessageDto,
    @IdempotencyKey() idempotencyKey: string,
  ): Promise<MovieMessageDto> {
    const message = await this.movieMatchService.sendAnonMessage(
      user.userId,
      id,
      dto.content,
      idempotencyKey,
    );
    return MovieMessageDto.from(message, user.userId);
  }

  @Get('anon/sessions/:id/messages')
  @ApiOperation({ summary: 'List chat phiên ẩn danh (cursor theo seq)' })
  @ApiCursorPageQuery()
  @ApiOkResponse({ type: MovieMessagesPageDto })
  async listAnonMessages(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: CursorPageQueryDto,
  ): Promise<MovieMessagesPageDto> {
    const page = await this.movieMatchService.listAnonMessages(
      user.userId,
      id,
      query.limit,
      query.cursor,
    );
    return {
      items: page.items.map((m) => MovieMessageDto.from(m, user.userId)),
      meta: page.meta,
    };
  }

  @Post('anon/sessions/:id/reactions')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 60, ttl: minutes(1) } })
  @ApiOperation({
    summary: 'Reaction emoji nổi trên video — realtime-only, không persist',
  })
  async sendAnonReaction(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReactMovieDto,
  ): Promise<void> {
    await this.movieMatchService.sendAnonReaction(user.userId, id, dto.emoji);
  }
}
