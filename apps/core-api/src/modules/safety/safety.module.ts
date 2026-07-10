import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { INTERACTION_SAFETY_POLICY } from './interaction-safety-policy';
import { SafetyController } from './safety.controller';
import { SafetyService } from './safety.service';
import { ReportEvidenceMetadata } from './entities/report-evidence-metadata.entity';
import { SafetyReport } from './entities/report.entity';
import { SafetyAuditEvent } from './entities/safety-audit-event.entity';
import { SafetyOperation } from './entities/safety-operation.entity';
import { UserBlock } from './entities/user-block.entity';

import { UserModule } from '../user';

@Module({
  imports: [
    UserModule,
    TypeOrmModule.forFeature([UserBlock, SafetyReport, ReportEvidenceMetadata, SafetyOperation, SafetyAuditEvent]),
  ],
  controllers: [SafetyController],
  providers: [
    SafetyService,
    { provide: INTERACTION_SAFETY_POLICY, useExisting: SafetyService },
  ],
  exports: [SafetyService, INTERACTION_SAFETY_POLICY],
})
export class SafetyModule {}
