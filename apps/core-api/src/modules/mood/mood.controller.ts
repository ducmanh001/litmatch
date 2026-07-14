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
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { MoodService } from './mood.service';
import {
  MoodPresetDto,
  MoodStatusResponseDto,
  SetMoodDto,
} from './dto/mood.dtos';
import {
  ApiIdempotencyKeyHeader,
  IdempotencyKey,
} from '../../common/decorators/idempotency-key.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

@ApiTags('mood')
@ApiBearerAuth()
@Controller('mood')
export class MoodController {
  constructor(private readonly moodService: MoodService) {}

  @Get('presets')
  @ApiOperation({ summary: 'Catalog mood preset đang bật' })
  @ApiOkResponse({ type: MoodPresetDto, isArray: true })
  async listPresets(): Promise<MoodPresetDto[]> {
    const presets = await this.moodService.listPresets();
    return presets.map((p) => MoodPresetDto.from(p));
  }

  @Get('status/me')
  @ApiOperation({ summary: 'Mood hiện tại của chính mình' })
  @ApiOkResponse({ type: MoodStatusResponseDto })
  async getMyStatus(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MoodStatusResponseDto> {
    return MoodStatusResponseDto.from(
      await this.moodService.getMyMood(user.userId),
    );
  }

  @Get('status/:userId')
  @ApiOperation({
    summary:
      'Mood công khai của 1 user — ẩn nếu có block 2 chiều (docs/services/mood-service.md § 3)',
  })
  @ApiOkResponse({ type: MoodStatusResponseDto })
  async getStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<MoodStatusResponseDto> {
    return MoodStatusResponseDto.from(
      await this.moodService.getPublicMood(user.userId, userId),
    );
  }

  @Post('status')
  @HttpCode(HttpStatus.OK)
  @ApiIdempotencyKeyHeader()
  @ApiOperation({
    summary: 'Set mood theo preset — auto-approve (W1 preset-only)',
  })
  @ApiOkResponse({ type: MoodStatusResponseDto })
  async setStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SetMoodDto,
    @IdempotencyKey() idempotencyKey: string,
  ): Promise<MoodStatusResponseDto> {
    const mood = await this.moodService.setMood(
      user.userId,
      dto.presetCode,
      idempotencyKey,
    );
    return MoodStatusResponseDto.from(mood);
  }

  @Delete('status')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiIdempotencyKeyHeader()
  @ApiOperation({ summary: 'Tắt mood hiện tại' })
  async clearStatus(
    @CurrentUser() user: AuthenticatedUser,
    @IdempotencyKey() idempotencyKey: string,
  ): Promise<void> {
    await this.moodService.clearMood(user.userId, idempotencyKey);
  }
}
