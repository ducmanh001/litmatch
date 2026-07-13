import { Module } from '@nestjs/common';

import { AuditModule } from '../../common/audit/audit.module';
import { UserModule } from '../user';
import { SafetyModule } from '../safety';

import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [UserModule, SafetyModule, AuditModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
