import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Body,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle, minutes } from '@nestjs/throttler';

import { SafetyService } from './safety.service';
import { BlockStatusDto, CreateReportDto, ReportDto } from './dto/safety.dtos';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

@ApiTags('safety')
@ApiBearerAuth()
@Controller('safety')
export class SafetyController {
  constructor(private readonly safetyService: SafetyService) {}

  @Post('reports')
  @HttpCode(HttpStatus.CREATED)
  // Chống report dồn dập từ 1 tài khoản (rate-limit tầng ứng dụng — bổ sung, không thay
  // per-pair cooldown + daily cap ở SafetyService § 4)
  @Throttle({ default: { limit: 10, ttl: minutes(60) } })
  @ApiOperation({
    summary: 'Report 1 user — trust score penalty chống spam (docs/06)',
  })
  @ApiCreatedResponse({ type: ReportDto })
  async createReport(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateReportDto,
  ): Promise<ReportDto> {
    const report = await this.safetyService.report(
      user.userId,
      dto.targetUserId,
      dto.reason,
      dto.description,
    );
    return ReportDto.from(report);
  }

  @Post('blocks/:targetUserId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Block 1 user — idempotent' })
  async block(
    @CurrentUser() user: AuthenticatedUser,
    @Param('targetUserId', ParseUUIDPipe) targetUserId: string,
  ): Promise<void> {
    await this.safetyService.block(user.userId, targetUserId);
  }

  @Delete('blocks/:targetUserId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Unblock 1 user — idempotent' })
  async unblock(
    @CurrentUser() user: AuthenticatedUser,
    @Param('targetUserId', ParseUUIDPipe) targetUserId: string,
  ): Promise<void> {
    await this.safetyService.unblock(user.userId, targetUserId);
  }

  @Get('blocks/:targetUserId')
  @ApiOperation({ summary: 'Đang có block chính mình → target hay không' })
  @ApiOkResponse({ type: BlockStatusDto })
  async blockStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('targetUserId', ParseUUIDPipe) targetUserId: string,
  ): Promise<BlockStatusDto> {
    const blocked = await this.safetyService.isBlocked(
      user.userId,
      targetUserId,
    );
    return { blocked };
  }
}
