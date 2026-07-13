import { Controller, Get, Inject, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';

import { Public } from '../decorators/public.decorator';
import { METRICS_REGISTRY } from './metrics.constants';

import type { Response } from 'express';
import type { Registry } from 'prom-client';

/** Prometheus scrape endpoint (docs/07 Giai đoạn 6) — không JWT, không throttle, không lộ trong Swagger. */
@ApiExcludeController()
@Controller('metrics')
export class MetricsController {
  constructor(@Inject(METRICS_REGISTRY) private readonly registry: Registry) {}

  @Public()
  @SkipThrottle()
  @Get()
  async metrics(
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    response.setHeader('Content-Type', this.registry.contentType);
    return this.registry.metrics();
  }
}
