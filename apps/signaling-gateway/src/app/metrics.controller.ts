import { Controller, Get, Inject, Res } from '@nestjs/common';

import { METRICS_REGISTRY } from './metrics.constants';

import type { Response } from 'express';
import type { Registry } from 'prom-client';

/** Prometheus scrape endpoint (docs/07 Giai đoạn 6) — không cần @Public() vì gateway không có
 * guard auth global trên route HTTP (chỉ namespace /signaling mới verify JWT lúc handshake). */
@Controller('metrics')
export class MetricsController {
  constructor(@Inject(METRICS_REGISTRY) private readonly registry: Registry) {}

  @Get()
  async metrics(
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    response.setHeader('Content-Type', this.registry.contentType);
    return this.registry.metrics();
  }
}
