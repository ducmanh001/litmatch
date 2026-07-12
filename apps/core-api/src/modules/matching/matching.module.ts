import { Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { MatchingController } from './matching.controller';
import { MatchingService } from './matching.service';
import { MatcherWorkerService } from './jobs/matcher-worker.service';
import { TicketSweeperService } from './jobs/ticket-sweeper.service';
import { MatchTicket } from './entities/match-ticket.entity';
import { MatchSession } from './entities/match-session.entity';
import { AllowAllInteractionPolicy, MATCH_INTERACTION_POLICY } from './ports/interaction-policy';
import { MATCHING_REDIS, matchingRedisProvider } from './redis/matching-redis.provider';
import { EconomyModule } from '../economy';
import { UserModule } from '../user';

import type Redis from 'ioredis';

@Module({
  imports: [TypeOrmModule.forFeature([MatchTicket, MatchSession]), UserModule, EconomyModule],
  controllers: [MatchingController],
  providers: [
    MatchingService,
    MatcherWorkerService,
    TicketSweeperService,
    matchingRedisProvider,
    // Safety module (block/report) chưa tồn tại (slice M1) — khi có, override provider này qua DI
    { provide: MATCH_INTERACTION_POLICY, useClass: AllowAllInteractionPolicy },
  ],
  exports: [], // chưa module nào cần gọi Matching — export tối thiểu (docs/05 § 5.3)
})
export class MatchingModule implements OnApplicationShutdown {
  constructor(@Inject(MATCHING_REDIS) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    await this.redis.quit().catch(() => undefined);
  }
}
