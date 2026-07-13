import { Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { MatchingController } from './matching.controller';
import { MatchingMetrics } from './matching.metrics';
import { MatchingService } from './matching.service';
import { MatcherWorkerService } from './jobs/matcher-worker.service';
import { TicketSweeperService } from './jobs/ticket-sweeper.service';
import { MatchTicket } from './entities/match-ticket.entity';
import { MatchSession } from './entities/match-session.entity';
import { MATCH_INTERACTION_POLICY } from './ports/interaction-policy';
import {
  MATCHING_REDIS,
  matchingRedisProvider,
} from './redis/matching-redis.provider';
import { EconomyModule } from '../economy';
import { NotificationModule } from '../notification';
import { SafetyModule, SafetyService } from '../safety';
import { UserModule } from '../user';

import type Redis from 'ioredis';

@Module({
  imports: [
    TypeOrmModule.forFeature([MatchTicket, MatchSession]),
    UserModule,
    EconomyModule,
    SafetyModule,
    NotificationModule,
  ],
  controllers: [MatchingController],
  providers: [
    MatchingService,
    MatchingMetrics,
    MatcherWorkerService,
    TicketSweeperService,
    matchingRedisProvider,
    // Safety module cung cấp implementation thật (docs/services/safety-service.md § 6) —
    // SafetyService.canPair thoả mãn MatchInteractionPolicy bằng structural typing
    { provide: MATCH_INTERACTION_POLICY, useExisting: SafetyService },
  ],
  // Soul Match đọc MatchSession qua MatchingService.findSessionById (read-only — docs/services/soul-match-service.md § 1)
  exports: [MatchingService],
})
export class MatchingModule implements OnApplicationShutdown {
  constructor(@Inject(MATCHING_REDIS) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    await this.redis.quit().catch(() => undefined);
  }
}
