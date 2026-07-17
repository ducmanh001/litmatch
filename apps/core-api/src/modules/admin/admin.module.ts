import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuditModule } from '../../common/audit/audit.module';
import { UserModule } from '../user';
import { SafetyModule } from '../safety';
import { GiftModule } from '../gift';
import { EconomyModule } from '../economy';
import { ShortVideoModule } from '../short-video';
import { NotificationModule } from '../notification';
import { PartyRoomModule } from '../party-room';
import { SupportModule } from '../support';

import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminRolePermission } from './entities/admin-role-permission.entity';
import { AdminPermissionGuard } from './services/admin-permission.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([AdminRolePermission]),
    UserModule,
    SafetyModule,
    GiftModule,
    EconomyModule,
    ShortVideoModule,
    NotificationModule,
    PartyRoomModule,
    SupportModule,
    AuditModule,
  ],
  controllers: [AdminController],
  providers: [AdminService, AdminPermissionGuard],
})
export class AdminModule {}
