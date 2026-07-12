import { Controller, Get, HttpStatus, Res } from '@nestjs/common';

import { SignalingGateway } from './signaling.gateway';

import type { Response } from 'express';

@Controller('health')
export class HealthController {
  constructor(private readonly signaling: SignalingGateway) {}

  @Get()
  liveCompatibility(): { status: string; uptimeSeconds: number } {
    return this.live();
  }

  @Get('live')
  live(): { status: string; uptimeSeconds: number } {
    return { status: 'ok', uptimeSeconds: Math.round(process.uptime()) };
  }

  @Get('ready')
  ready(@Res({ passthrough: true }) response: Response): {
    status: 'ok' | 'unavailable';
    checks: { redisSubscription: string };
  } {
    const ready = this.signaling.isReady();
    if (!ready) response.status(HttpStatus.SERVICE_UNAVAILABLE);
    return {
      status: ready ? 'ok' : 'unavailable',
      checks: { redisSubscription: ready ? 'up' : 'down' },
    };
  }
}
