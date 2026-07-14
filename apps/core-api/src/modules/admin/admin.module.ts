import { Module } from '@nestjs/common';

import { AuditModule } from '../../common/audit/audit.module';
import { UserModule } from '../user';
import { SafetyModule } from '../safety';
import { GiftModule } from '../gift';
import { EconomyModule } from '../economy';
import { ShortVideoModule } from '../short-video';

import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [
    UserModule,
    SafetyModule,
    GiftModule,
    EconomyModule,
    ShortVideoModule,
    AuditModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
