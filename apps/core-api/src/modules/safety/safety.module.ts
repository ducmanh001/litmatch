import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { SafetyController } from './safety.controller';
import { SafetyService } from './safety.service';
import { Block } from './entities/block.entity';
import { Report } from './entities/report.entity';
import { UserModule } from '../user';

@Module({
  imports: [TypeOrmModule.forFeature([Report, Block]), UserModule],
  controllers: [SafetyController],
  providers: [SafetyService],
  // SafetyService export để Matching bind MATCH_INTERACTION_POLICY (useExisting) + Friend Chat
  // gọi isBlocked() (docs/services/safety-service.md § 6)
  exports: [SafetyService],
})
export class SafetyModule {}
