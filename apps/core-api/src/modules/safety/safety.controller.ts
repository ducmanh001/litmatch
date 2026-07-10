import { Body, Controller, Delete, Get, Headers, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiHeader, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { CreateBlockDto, CreateReportDto, SafetyReportDto, UserBlockDto } from './dto/safety.dtos';
import { SafetyService } from './safety.service';

import { CurrentUser } from '../../common/decorators/current-user.decorator';

import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

@ApiTags('safety')
@ApiBearerAuth()
@Controller('safety')
export class SafetyController {
  constructor(private readonly safetyService: SafetyService) {}

  @Post('blocks')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOperation({ summary: 'Chặn một user theo một chiều' })
  @ApiCreatedResponse({ type: UserBlockDto })
  async createBlock(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateBlockDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<UserBlockDto> {
    return UserBlockDto.from(await this.safetyService.createBlock(user.userId, dto.blockedUserId, idempotencyKey));
  }

  @Delete('blocks/:blockedUserId')
  @HttpCode(200)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOperation({ summary: 'Bỏ quan hệ chặn do chính mình tạo' })
  @ApiOkResponse({ type: UserBlockDto })
  async unblock(
    @CurrentUser() user: AuthenticatedUser,
    @Param('blockedUserId', ParseUUIDPipe) blockedUserId: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<UserBlockDto> {
    return UserBlockDto.from(await this.safetyService.unblock(user.userId, blockedUserId, idempotencyKey));
  }

  @Post('reports')
  @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOperation({ summary: 'Gửi report; chỉ nhận evidence metadata có cấu trúc' })
  @ApiCreatedResponse({ type: SafetyReportDto })
  createReport(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateReportDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<SafetyReportDto> {
    return this.safetyService.createReport(user.userId, dto, idempotencyKey);
  }

  @Get('reports')
  @ApiOperation({ summary: 'Danh sách tối đa 50 report gần nhất của chính mình' })
  @ApiOkResponse({ type: [SafetyReportDto] })
  listOwnReports(@CurrentUser() user: AuthenticatedUser): Promise<SafetyReportDto[]> {
    return this.safetyService.listOwnReports(user.userId);
  }
}
