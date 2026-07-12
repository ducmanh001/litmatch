import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';

import { Public } from '../common/decorators/public.decorator';
import { ReadinessService } from './readiness.service';

import type { Response } from 'express';
import type { ReadinessResult } from './readiness.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly readiness: ReadinessService) {}

  @Public()
  @SkipThrottle()
  @Get()
  @ApiOperation({ summary: 'Liveness check tương thích endpoint cũ' })
  liveCompatibility(): { status: string; uptimeSeconds: number } {
    return this.live();
  }

  @Public()
  @SkipThrottle()
  @Get('live')
  @ApiOperation({
    summary: 'Liveness: process đang chạy, không gọi dependency',
  })
  live(): { status: string; uptimeSeconds: number } {
    return { status: 'ok', uptimeSeconds: Math.round(process.uptime()) };
  }

  @Public()
  @SkipThrottle()
  @Get('ready')
  @ApiOperation({
    summary: 'Readiness: Postgres và Redis sẵn sàng nhận traffic',
  })
  @ApiResponse({
    status: HttpStatus.SERVICE_UNAVAILABLE,
    description: 'Dependency chưa sẵn sàng',
  })
  async ready(
    @Res({ passthrough: true }) response: Response,
  ): Promise<ReadinessResult> {
    const result = await this.readiness.check();
    if (result.status !== 'ok') response.status(HttpStatus.SERVICE_UNAVAILABLE);
    return result;
  }
}
