import { Module } from '@nestjs/common';

import { DiscoveryController } from './discovery.controller';
import { DiscoveryService } from './discovery.service';
import { SafetyModule } from '../safety';
import { UserModule } from '../user';

@Module({
  imports: [UserModule, SafetyModule],
  controllers: [DiscoveryController],
  providers: [DiscoveryService],
  exports: [DiscoveryService], // public API của module — module khác chỉ được import qua index.ts
})
export class DiscoveryModule {}
