import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { MatchingController } from './matching.controller';
import { MatchingService } from './matching.service';
import { MatcherWorkerService } from './matcher-worker.service';
import { TicketSweeperService } from './ticket-sweeper.service';
import { MatchingQueueProjectionService } from './matching-queue-projection.service';
import { MatchingOperationRecoveryService } from './matching-operation-recovery.service';
import { MatchSession } from './entities/match-session.entity';
import { MatchTicket } from './entities/match-ticket.entity';
import { MatchingOperation } from './entities/matching-operation.entity';
import { MatchingQueueOutbox } from './entities/matching-queue-outbox.entity';
import { matchingRedisProvider } from './redis/matching-redis.provider';
import { MatchingQueueStore } from './redis/matching-queue.script';

import { EconomyModule } from '../economy';
import { UserModule } from '../user';

@Module({
  imports: [
    TypeOrmModule.forFeature([MatchTicket, MatchSession, MatchingOperation, MatchingQueueOutbox]),
    EconomyModule,
    UserModule,
  ],
  controllers: [MatchingController],
  providers: [
    MatchingService,
    MatcherWorkerService, // internal — không export
    TicketSweeperService, // internal — không export
    MatchingQueueProjectionService,
    MatchingOperationRecoveryService,
    matchingRedisProvider,
    MatchingQueueStore,
  ],
  exports: [MatchingService],
})
export class MatchingModule {}
