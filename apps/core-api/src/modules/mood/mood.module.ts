import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { MoodController } from './mood.controller';
import { MoodService } from './mood.service';
import { MoodRetentionJob } from './jobs/mood-retention.job';
import { MoodPreset } from './entities/mood-preset.entity';
import { MoodStatusEvent } from './entities/mood-status-event.entity';
import { SafetyModule } from '../safety';

@Module({
  imports: [
    TypeOrmModule.forFeature([MoodPreset, MoodStatusEvent]),
    SafetyModule, // ẩn mood 2 chiều nếu block (getBlockedUserIds)
  ],
  controllers: [MoodController],
  providers: [MoodService, MoodRetentionJob],
  exports: [MoodService], // module khác compose getPublicMood() qua DI
})
export class MoodModule {}
