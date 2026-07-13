import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AdminAuditLog } from './audit-log.entity';
import { AuditLogService } from './audit-log.service';

/** Hạ tầng dùng chung (như common/guards, common/livekit) — không phải domain module. */
@Module({
  imports: [TypeOrmModule.forFeature([AdminAuditLog])],
  providers: [AuditLogService],
  exports: [AuditLogService],
})
export class AuditModule {}
