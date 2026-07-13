import { Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CallingController } from './calling.controller';
import { CallingMetrics } from './calling.metrics';
import { CallingService } from './calling.service';
import { CallSession } from './entities/call-session.entity';
import { CallTickerService } from './jobs/call-ticker.service';
import { LivekitRoomPort, SdkLivekitRoomPort } from './ports/livekit-room';
import {
  CALLING_REDIS,
  callingRedisProvider,
} from './redis/calling-redis.provider';
import { LivekitWebhookController } from './webhooks/livekit-webhook.controller';
import { EconomyModule } from '../economy';
import { MatchingModule } from '../matching';

import type Redis from 'ioredis';

@Module({
  imports: [
    TypeOrmModule.forFeature([CallSession]),
    MatchingModule, // đọc MatchSession qua MatchingService (read-only — cùng pattern Soul Match)
    EconomyModule, // billing theo phút qua spendDiamond (DI trong process — docs/03 § 3.7)
  ],
  controllers: [CallingController, LivekitWebhookController],
  providers: [
    CallingService,
    CallingMetrics,
    CallTickerService,
    callingRedisProvider,
    { provide: LivekitRoomPort, useClass: SdkLivekitRoomPort },
  ],
  exports: [], // chưa module nào cần gọi Calling — export tối thiểu (docs/05 § 5.3)
})
export class CallingModule implements OnApplicationShutdown {
  constructor(@Inject(CALLING_REDIS) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    await this.redis.quit().catch(() => undefined);
  }
}
