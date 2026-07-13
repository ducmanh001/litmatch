import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AvatarController } from './avatar.controller';
import { AvatarService } from './avatar.service';
import { AvatarAsset } from './entities/avatar-asset.entity';
import { UserAvatarConfig } from './entities/user-avatar-config.entity';
import { UserAvatarItem } from './entities/user-avatar-item.entity';
import { EconomyModule } from '../economy';

@Module({
  imports: [
    TypeOrmModule.forFeature([AvatarAsset, UserAvatarItem, UserAvatarConfig]),
    EconomyModule, // mua item trả phí qua spendDiamond generic (docs/services/avatar-service.md § 2)
  ],
  controllers: [AvatarController],
  providers: [AvatarService],
  exports: [], // chưa module nào cần gọi Avatar
})
export class AvatarModule {}
