import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
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
  CreateMovieSessionDto,
  MovieSessionDto,
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
}
