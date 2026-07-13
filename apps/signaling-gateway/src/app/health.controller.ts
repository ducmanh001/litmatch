import { Controller, Get, HttpStatus, Res } from '@nestjs/common';

import { SignalingRedisAdapterService } from './redis-adapter.service';
import { SignalingGateway } from './signaling.gateway';

import type { Response } from 'express';

@Controller('health')
export class HealthController {
  constructor(
    private readonly signaling: SignalingGateway,
    private readonly redisAdapter: SignalingRedisAdapterService,
  ) {}

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
    checks: { redisSubscription: string; redisClusterAdapter: string };
  } {
    const fanoutReady = this.signaling.isReady();
    // Cluster adapter down không chặn fanout hiện có (relay riêng qua PSUBSCRIBE) nhưng làm mất
    // khả năng chia sẻ room/broadcast Socket.IO xuyên instance — vẫn tính vào readiness tổng thể
    // vì pod không "sẵn sàng phục vụ đúng nghĩa scale ngang" khi thiếu adapter (docs/07 GĐ6).
    const adapterReady = this.redisAdapter.isReady();
    const ready = fanoutReady && adapterReady;
    if (!ready) response.status(HttpStatus.SERVICE_UNAVAILABLE);
    return {
      status: ready ? 'ok' : 'unavailable',
      checks: {
        redisSubscription: fanoutReady ? 'up' : 'down',
        redisClusterAdapter: adapterReady ? 'up' : 'down',
      },
    };
  }
}
