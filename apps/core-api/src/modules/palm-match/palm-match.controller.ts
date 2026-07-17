import {
  Body,
  Controller,
  Delete,
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

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  PalmMatchReadingDto,
  PalmMatchReadingQueryDto,
  PalmMatchStateDto,
  RatePalmMatchDto,
} from './dto/palm-match.dtos';
import { PalmMatchService } from './palm-match.service';

import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

@ApiTags('palm-match')
@ApiBearerAuth()
@Controller('palm-match')
export class PalmMatchController {
  constructor(private readonly palmMatchService: PalmMatchService) {}

  @Get('reading')
  @ApiOperation({
    summary:
      'Nội dung bói toán giải trí — deterministic theo user + category + ngày server (guest dùng được)',
  })
  @ApiOkResponse({ type: PalmMatchReadingDto })
  async getReading(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PalmMatchReadingQueryDto,
  ): Promise<PalmMatchReadingDto> {
    return this.palmMatchService.getReading(
      user.userId,
      query.category,
      query.targetName,
    );
  }

  @Post('queue')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Enqueue idempotent và thử ghép Palm Match ẩn danh',
  })
  @ApiOkResponse({ type: PalmMatchStateDto })
  async joinQueue(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PalmMatchStateDto> {
    return this.palmMatchService.joinQueue(user.userId);
  }

  @Get('current')
  @ApiOperation({
    summary: 'State phục hồi/poll của queue hoặc session hiện tại',
  })
  @ApiOkResponse({ type: PalmMatchStateDto })
  async getCurrent(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PalmMatchStateDto> {
    return this.palmMatchService.getCurrent(user.userId);
  }

  @Post('sessions/:id/flip')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Lật lá của chính caller — idempotent' })
  @ApiOkResponse({ type: PalmMatchStateDto })
  async flip(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PalmMatchStateDto> {
    return this.palmMatchService.flip(user.userId, id);
  }

  @Post('sessions/:id/rating')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Chốt like/skip một lần; mutual-like mở Friendship',
  })
  @ApiOkResponse({ type: PalmMatchStateDto })
  async rate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RatePalmMatchDto,
  ): Promise<PalmMatchStateDto> {
    return this.palmMatchService.rate(user.userId, id, dto.rating);
  }

  @Delete('current')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Huỷ queue/session active hoặc dismiss kết quả terminal',
  })
  @ApiOkResponse({ type: PalmMatchStateDto })
  async dismissCurrent(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PalmMatchStateDto> {
    return this.palmMatchService.dismissCurrent(user.userId);
  }
}
