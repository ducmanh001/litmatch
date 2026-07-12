import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  liveCompatibility(): { status: string; uptimeSeconds: number } {
    return this.live();
  }

  @Get('live')
  live(): { status: string; uptimeSeconds: number } {
    return { status: 'ok', uptimeSeconds: Math.round(process.uptime()) };
  }

  @Get('ready')
  ready(): { status: string } {
    // Gateway chưa có dependency bắt buộc; khi thêm Redis adapter/LiveKit, kiểm tra tại đây.
    return { status: 'ok' };
  }
}
