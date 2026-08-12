import { Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { MatchingController } from './matching.controller';
import { InviteController } from './controllers/invite.controller';
import { MatchingMetrics } from './matching.metrics';
import { MatchingService } from './matching.service';
import { InviteService } from './services/invite.service';
import { MatcherWorkerService } from './jobs/matcher-worker.service';
import { TicketSweeperService } from './jobs/ticket-sweeper.service';
import { InviteSweeperService } from './jobs/invite-sweeper.service';
import { MatcherWakeup } from './matcher-wakeup';
import { MatchTicket } from './entities/match-ticket.entity';
import { MatchSession } from './entities/match-session.entity';
import { MatchInvite } from './entities/match-invite.entity';
import { GuestMatchQuota } from './entities/guest-match-quota.entity';
import { GuestMatchQuotaService } from './services/guest-match-quota.service';
import { MATCH_INTERACTION_POLICY } from './ports/interaction-policy';
import {
  MATCHING_QUEUE,
  MATCHING_RATE_LIMIT,
  MATCHING_REALTIME,
  matchingRateLimitProvider,
  matchingRealtimeProvider,
  matchingRedisClientProvider,
  matchingQueueProvider,
} from './redis/matching-redis.provider';
import { EconomyModule } from '../economy';
import { NotificationModule } from '../notification';
import { SafetyModule, SafetyService } from '../safety';
import { UserModule } from '../user';
import { AuthModule } from '../auth';

import type { RateLimitPort } from '../../common/redis/rate-limit.port';
import type { RealtimePublisherPort } from '../../common/realtime/realtime-publisher.port';
import type { MatchingQueuePort } from './ports/matching-queue.port';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MatchTicket,
      MatchSession,
      MatchInvite,
      GuestMatchQuota,
    ]),
    AuthModule,
    UserModule,
    EconomyModule,
    SafetyModule,
    NotificationModule,
  ],
  controllers: [MatchingController, InviteController],
  providers: [
    MatchingService,
    InviteService,
    MatchingMetrics,
    MatcherWorkerService,
    MatcherWakeup,
    TicketSweeperService,
    InviteSweeperService,
    GuestMatchQuotaService,
    matchingRedisClientProvider,
    matchingQueueProvider,
    matchingRateLimitProvider,
    matchingRealtimeProvider,
    // Safety module cung cấp implementation thật (docs/services/safety-service.md § 6) —
    // SafetyService.canPair thoả mãn MatchInteractionPolicy bằng structural typing
    { provide: MATCH_INTERACTION_POLICY, useExisting: SafetyService },
  ],
  // Soul Match đọc MatchSession qua MatchingService.findSessionById (read-only — docs/services/soul-match-service.md § 1)
  exports: [MatchingService],
})
export class MatchingModule implements OnApplicationShutdown {
  constructor(
    @Inject(MATCHING_QUEUE) private readonly queue: MatchingQueuePort,
    @Inject(MATCHING_RATE_LIMIT) private readonly rateLimit: RateLimitPort,
    @Inject(MATCHING_REALTIME)
    private readonly realtime: RealtimePublisherPort,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    await this.queue.close();
    await this.rateLimit.close?.();
    await this.realtime.close?.();
  }
}
