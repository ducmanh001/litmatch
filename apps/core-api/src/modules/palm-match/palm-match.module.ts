import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PalmMatchController } from './palm-match.controller';
import { PalmMatchService } from './palm-match.service';
import {
  PalmMatchActiveParticipant,
  PalmMatchQueueEntry,
  PalmMatchSession,
} from './entities/palm-match-session.entity';
import { PalmReadingTemplate } from './entities/palm-reading-template.entity';
import { FriendModule } from '../friend';
import { SafetyModule } from '../safety';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PalmReadingTemplate,
      PalmMatchSession,
      PalmMatchQueueEntry,
      PalmMatchActiveParticipant,
    ]),
    FriendModule,
    SafetyModule,
  ],
  controllers: [PalmMatchController],
  providers: [PalmMatchService],
  exports: [],
})
export class PalmMatchModule {}
